/**
 * LLM Client — AI-powered tree hazard analysis
 *
 * Zero-dependency: uses Node 18+ built-in fetch.
 * Sends the citizen's complaint text + field photo to a vision-capable LLM
 * (OpenAI-compatible /v1/chat/completions endpoint) and returns a structured
 * risk assessment.
 *
 * The system prompt enforces anti-gaming rules:
 * - Visual evidence is weighted over text claims
 * - Text-image conflicts are flagged
 * - Exaggeration without visual backing is penalized
 */

import fs from "node:fs";
import path from "node:path";

const SYSTEM_PROMPT = `You are an expert arborist AI assistant working for Halifax Urban Forestry. Your job is to analyze tree hazard complaints and produce a structured risk assessment.

You will receive TWO inputs:
1. A TEXT description of the complaint from a citizen
2. A PHOTO of the tree (if provided)

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

  // Build the user message — text + optional photo
  const userText = `Please analyze this tree hazard complaint.

CITIZEN DESCRIPTION:
"${complaintText}"

${photoPath ? "A field photo is attached. Use both the text and the photo to assess the danger." : "No photo was provided. Assess based on the text description only, but set is_unsure to true and confidence below 0.5."}

Return your assessment as the JSON object specified in your instructions.`;

  const content = [{ type: "text", text: userText }];

  // Attach photo as base64 if provided
  if (photoPath) {
    try {
      const imageBuffer = fs.readFileSync(photoPath);
      const base64 = imageBuffer.toString("base64");
      const ext = path.extname(photoPath).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" :
        ext === ".gif" ? "image/gif" :
        ext === ".webp" ? "image/webp" :
        "image/jpeg";
      content.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${base64}` },
      });
    } catch (err) {
      console.warn("Failed to read photo for LLM:", err.message);
      // Continue without the photo
    }
  }

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    temperature: 0.2,
    max_tokens: 1024,
  };

  const url = `${baseUrl}/chat/completions`;
  console.log(`[LLM] Analyzing hazard (model=${model}, hasPhoto=${!!photoPath})…`);

  // GLM-5.2 is a reasoning model — can take up to 90s
  const llmTimeout = AbortSignal.timeout(120000);

  let response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: llmTimeout,
  });

  // If multimodal isn't supported, retry with text-only content
  if (!response.ok && photoPath) {
    const errText = await response.text().catch(() => "");
    if (response.status === 400 && errText.includes("multimodal")) {
      console.warn("[LLM] Multimodal not supported, retrying text-only…");
      body.messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText }, // plain string, no image
      ];
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
    } else {
      throw new Error(`LLM API error ${response.status}: ${errText.slice(0, 200)}`);
    }
  }

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

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("[LLM] Failed to parse response:", rawContent.slice(0, 500));
    throw new Error("LLM returned invalid JSON");
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
