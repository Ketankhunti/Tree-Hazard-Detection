/**
 * LLM Client — AI-powered tree hazard analysis
 *
 * Zero-dependency: uses Node 18+ built-in fetch.
 *
 * Two-step pipeline:
 *   1. Llama Parse extracts a text description from the field photo
 *   2. GLM-5.2 analyzes complaint text + photo description for hazard assessment
 *
 * The system prompt enforces anti-gaming rules:
 * - Visual evidence is weighted over text claims
 * - Text-image conflicts are flagged
 * - Exaggeration without visual backing is penalized
 */

import { describePhoto } from "./llamaParseClient.js";

const SYSTEM_PROMPT = `You are an expert arborist AI assistant working for Halifax Urban Forestry. Your job is to analyze tree hazard complaints and produce a structured risk assessment.

You will receive TWO inputs:
1. A TEXT description of the complaint from a citizen
2. A PHOTO DESCRIPTION (text extracted from the field photo by an image-to-text model), if a photo was provided

CRITICAL ANTI-GAMING RULES:
- Citizens may exaggerate or write alarming descriptions to get faster service. You must NOT inflate a danger score based solely on dramatic language.
- If the text claims a severe hazard (e.g. "leaning dangerously over my house") but the PHOTO shows a healthy, upright tree with no visible lean, you must FLAG this as a text-image conflict and reduce the danger score to reflect what you actually SEE in the photo.
- If the text is vague (e.g. "tree looks weird") but the PHOTO shows a real hazard (cracked trunk, large dead branch, leaning), you must score based on the VISUAL EVIDENCE, not the lack of text detail.
- Ignore emotional urgency cues like "URGENT!!!", "emergency", "immediately", "someone could die" unless they are backed by visible evidence in the photo.
- Do not give bonus points for length of description or number of exclamation marks.
- A short, calm description with a matching photo is MORE credible than a long, dramatic description with no photo or a contradicting photo.

SCORING RULES:
- Danger Score (0-100): Based on VISIBLE hazards in the photo, cross-referenced with the text. If no photo is provided, rely on text but set confidence lower and mark for human review.
- Hazards to look for: leaning tree, fallen/uprooted, trunk splitting/cracking, dead branches, hanging limbs, storm damage, proximity to power lines, proximity to buildings/vehicles, road/sidewalk obstruction.
- is_unsure: true if (a) no photo is provided, (b) the photo is too dark/blurry to assess, or (c) the text and photo contradict each other significantly.
- text_image_conflict: true if the text describes a hazard that the photo does not show, or vice versa.

Return ONLY a valid JSON object, no other text, no markdown fences:
{
  "danger_score": <0-100 integer>,
  "hazards": ["<hazard label>", ...],
  "is_unsure": <boolean>,
  "text_image_conflict": <boolean>,
  "confidence": <0.0-1.0 float>,
  "reasoning": "<one to two sentence explanation referencing both text and photo evidence>"
}

HAZARD LABELS (use exactly these):
- "Leaning Tree"
- "Falling Risk"
- "Property Threat"
- "Vehicle Threat"
- "Power Line Threat"
- "Split Trunk"
- "Dead Branch"
- "Storm Damage"
- "Road Obstruction"
- "Sidewalk Obstruction"

Remember: You are a TRIAGE tool, not a final determination. Your job is to help prioritize which complaints get human inspection first. Never claim a tree is definitely safe or definitely dangerous.`;

/**
 * Analyze a tree hazard complaint using the LLM.
 *
 * @param {string} complaintText  — citizen's text description
 * @param {string|null} photoPath — absolute path to the uploaded photo file, or null
 * @returns {Promise<object>}     — { dangerScore, hazards, isUnsure, textImageConflict, confidence, reasoning }
 */
export async function analyzeHazard(complaintText, photoPath) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "http://34.41.10.8:4000/v1";
  const model = process.env.LLM_MODEL || "glm-5.2";

  if (!apiKey) {
    throw new Error("LLM_API_KEY not set in environment");
  }

  // Step 1: If a photo is provided, extract a text description using Llama Parse
  let photoDescription = null;
  if (photoPath) {
    console.log("[LLM] Extracting photo description via Llama Parse…");
    photoDescription = await describePhoto(photoPath);
  }

  // Step 2: Build the user message with complaint text + photo description
  const userText = `Please analyze this tree hazard complaint.

CITIZEN DESCRIPTION:
"${complaintText}"

${photoDescription ? `FIELD PHOTO DESCRIPTION (extracted by image-to-text model):
"${photoDescription}"

Use both the citizen's text and the photo description to assess the danger. The photo description is your visual evidence.` : "No photo was provided. Assess based on the text description only, but set is_unsure to true and confidence below 0.5."}

Return your assessment as the JSON object specified in your instructions.`;

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText },
    ],
    temperature: 0.2,
    max_tokens: 8192,
  };

  const url = `${baseUrl}/chat/completions`;
  console.log(`[LLM] Analyzing hazard (model=${model}, hasPhoto=${!!photoPath}, hasDescription=${!!photoDescription})…`);

  // GLM-5.2 is a reasoning model — can take up to 90s
  const llmTimeout = AbortSignal.timeout(120000);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: llmTimeout,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`LLM API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;

  if (!rawContent) {
    throw new Error("LLM returned empty response");
  }

  // Parse the JSON from the LLM response — it may be wrapped in markdown fences
  let jsonStr = rawContent.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Also try to find a bare { ... } block
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (braceMatch && !fenceMatch) {
    jsonStr = braceMatch[0];
  }

  // Handle truncated JSON (reasoning models may hit token limit mid-JSON)
  // Try to close incomplete JSON by adding missing brackets
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Attempt to repair truncated JSON
    const repaired = repairTruncatedJson(jsonStr);
    try {
      parsed = JSON.parse(repaired);
      console.warn("[LLM] JSON was truncated, auto-repaired");
    } catch {
      console.error("[LLM] Failed to parse response:", rawContent.slice(0, 500));
      throw new Error("LLM returned invalid JSON");
    }
  }

  // Normalize to our frontend-expected format
  return {
    dangerScore: Math.min(100, Math.max(0, Math.round(parsed.danger_score ?? 0))),
    hazards: Array.isArray(parsed.hazards)
      ? parsed.hazards.map((label) => ({
          label,
          points: hazardLabelToPoints(label),
          source: "image",
        }))
      : [],
    isUnsure: Boolean(parsed.is_unsure),
    textImageConflict: Boolean(parsed.text_image_conflict),
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5))),
    reasoning: parsed.reasoning || "No reasoning provided.",
    hasImage: !!photoPath,
    photoDescription: photoDescription || null,
    summary: parsed.reasoning || "No summary provided.",
  };
}

/** Map hazard labels to point values (mirrors scoringEngine.ts) */
function hazardLabelToPoints(label) {
  const map = {
    "Leaning Tree": 30,
    "Falling Risk": 25,
    "Property Threat": 20,
    "Vehicle Threat": 15,
    "Power Line Threat": 15,
    "Split Trunk": 10,
    "Dead Branch": 10,
    "Storm Damage": 10,
    "Road Obstruction": 5,
    "Sidewalk Obstruction": 5,
  };
  return map[label] ?? 10;
}

/**
 * Attempt to repair truncated JSON from a reasoning model.
 * Strategies:
 *   1. If inside a string, close the string
 *   2. Close any unclosed arrays and objects
 *   3. Remove trailing commas
 */
function repairTruncatedJson(str) {
  let result = str.trim();

  // Remove trailing comma (common truncation point)
  result = result.replace(/,\s*$/, "");

  // Count unclosed brackets
  let braces = 0;  // {}
  let brackets = 0; // []
  let inString = false;
  let escape = false;

  for (let i = 0; i < result.length; i++) {
    const ch = result[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++;
    if (ch === "}") braces--;
    if (ch === "[") brackets++;
    if (ch === "]") brackets--;
  }

  // If we're inside a string, close it
  if (inString) {
    result += '"';
  }

  // Remove any trailing comma after closing the string
  result = result.replace(/,\s*$/, "");

  // Close unclosed brackets first, then braces
  for (let i = 0; i < brackets; i++) result += "]";
  for (let i = 0; i < braces; i++) result += "}";

  return result;
}
