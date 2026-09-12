/**
 * GLM-5.2 LLM Client — AI-powered tree hazard analysis
 *
 * Two-step pipeline:
 *   1. Llama Parse extracts a text description from the field photo
 *   2. GLM-5.2 analyzes complaint text + photo description for hazard assessment
 *
 * The system prompt enforces anti-gaming rules:
 * - Visual evidence is weighted over text claims
 * - Text-image conflicts are flagged
 * - Exaggeration without visual backing is penalized
 *
 * Returns a Classification-compatible result that the existing scoring
 * engine and UI can consume without changes.
 */

import { describePhoto } from "./llamaParse";
import type { Classification, DetectedHazard, HazardId } from "@/shared/types";
import { ENGINE_VERSION } from "@/backend/domain/scoring";

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

/** Maps LLM hazard labels to the app's HazardId + point values. */
const HAZARD_MAP: Record<
  string,
  { id: HazardId; label: string; points: number; phrase: string }
> = {
  "Leaning Tree": {
    id: "leaning",
    label: "Leaning",
    points: 30,
    phrase: "a leaning tree",
  },
  "Falling Risk": {
    id: "falling",
    label: "Falling Risk",
    points: 25,
    phrase: "signs that the tree may come down",
  },
  "Property Threat": {
    id: "property",
    label: "Property Threat",
    points: 20,
    phrase: "a house or building in the fall path",
  },
  "Vehicle Threat": {
    id: "vehicle",
    label: "Vehicle Threat",
    points: 15,
    phrase: "vehicles or a driveway underneath",
  },
  "Power Line Threat": {
    id: "powerline",
    label: "Power Line",
    points: 15,
    phrase: "contact with overhead power lines",
  },
  "Split Trunk": {
    id: "trunk",
    label: "Trunk Damage",
    points: 10,
    phrase: "a split or cracked trunk",
  },
  "Dead Branch": {
    id: "deadBranch",
    label: "Dead Branch",
    points: 10,
    phrase: "a dead or hanging limb overhead",
  },
  "Storm Damage": {
    id: "storm",
    label: "Storm Damage",
    points: 10,
    phrase: "recent storm damage",
  },
  "Road Obstruction": {
    id: "road",
    label: "Road Obstruction",
    points: 5,
    phrase: "an obstruction in the roadway",
  },
  "Sidewalk Obstruction": {
    id: "sidewalk",
    label: "Sidewalk Obstruction",
    points: 5,
    phrase: "an obstruction on the sidewalk",
  },
};

export interface AIAnalysisResult {
  dangerScore: number;
  hazards: DetectedHazard[];
  isUnsure: boolean;
  textImageConflict: boolean;
  confidence: number;
  reasoning: string;
  hasImage: boolean;
  photoDescription: string | null;
}

/**
 * Analyze a tree hazard complaint using GLM-5.2.
 *
 * @param complaintText  — citizen's text description
 * @param photoBuffer    — raw photo bytes, or null
 * @param mimeType       — photo MIME type, or null
 * @returns structured AI analysis result
 */
export async function analyzeHazard(
  complaintText: string,
  photoBuffer: Buffer | null,
  mimeType: string | null
): Promise<AIAnalysisResult> {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "http://34.41.10.8:4000/v1";
  const model = process.env.LLM_MODEL || "glm-5.2";

  if (!apiKey) {
    throw new Error("LLM_API_KEY not set in environment");
  }

  // Step 1: If a photo is provided, extract a text description using Llama Parse
  let photoDescription: string | null = null;
  if (photoBuffer && mimeType) {
    console.log("[LLM] Extracting photo description via Llama Parse…");
    photoDescription = await describePhoto(photoBuffer, mimeType);
  }

  // Step 2: Build the user message with complaint text + photo description
  const userText = `Please analyze this tree hazard complaint.

CITIZEN DESCRIPTION:
"${complaintText}"

${
  photoDescription
    ? `FIELD PHOTO DESCRIPTION (extracted by image-to-text model):
"${photoDescription}"

Use both the citizen's text and the photo description to assess the danger. The photo description is your visual evidence.`
    : "No photo was provided. Assess based on the text description only, but set is_unsure to true and confidence below 0.5."
}

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
  console.log(
    `[LLM] Analyzing hazard (model=${model}, hasPhoto=${!!photoBuffer}, hasDescription=${!!photoDescription})…`
  );

  // GLM-5.2 is a reasoning model — can take up to 90s
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `LLM API error ${response.status}: ${errText.slice(0, 200)}`
    );
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

  let parsed: {
    danger_score?: number;
    hazards?: string[];
    is_unsure?: boolean;
    text_image_conflict?: boolean;
    confidence?: number;
    reasoning?: string;
  };

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

  // Normalize to our app's format
  const dangerScore = Math.min(
    100,
    Math.max(0, Math.round(parsed.danger_score ?? 0))
  );

  const hazards: DetectedHazard[] = Array.isArray(parsed.hazards)
    ? parsed.hazards.map((label: string) => {
        const mapped = HAZARD_MAP[label];
        if (mapped) {
          return {
            id: mapped.id,
            label: mapped.label,
            points: mapped.points,
            evidence: "identified by AI analysis",
            phrase: mapped.phrase,
          };
        }
        return {
          id: "leaning" as HazardId, // fallback
          label,
          points: 10,
          evidence: "identified by AI analysis",
          phrase: "a potential hazard",
        };
      })
    : [];

  return {
    dangerScore,
    hazards,
    isUnsure: Boolean(parsed.is_unsure),
    textImageConflict: Boolean(parsed.text_image_conflict),
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5))),
    reasoning: parsed.reasoning || "No reasoning provided.",
    hasImage: !!photoBuffer,
    photoDescription,
  };
}

/**
 * Convert an AIAnalysisResult into a Classification object
 * compatible with the existing scoring engine and UI.
 */
export function aiResultToClassification(
  result: AIAnalysisResult,
  now: Date = new Date()
): Classification {
  return {
    hazards: result.hazards,
    dangerScore: result.dangerScore,
    reviewStatus: result.isUnsure ? "Unsure" : "Reviewed",
    reviewNote: result.textImageConflict
      ? "AI flagged a text-image conflict — human review needed."
      : result.reasoning,
    imageFindings: result.hasImage
      ? {
          usable: !result.isUnsure,
          severity: result.dangerScore,
          hazards: result.hazards.map((h) => h.id),
          summary: result.reasoning,
          confidence: result.confidence,
          model: process.env.LLM_MODEL || "glm-5.2",
          rejectionReason: result.isUnsure ? "AI flagged for review" : null,
        }
      : null,
    fusion: {
      verdict: result.textImageConflict
        ? "text-worse"
        : result.hasImage
          ? "agree"
          : "text-only",
      textDanger: result.dangerScore,
      imageDanger: result.hasImage ? result.dangerScore : null,
      note: result.reasoning,
    },
    engineVersion: ENGINE_VERSION,
    source: result.hasImage ? "fused" : "text",
    computedAt: now.toISOString(),
  };
}

/**
 * Attempt to repair truncated JSON from a reasoning model.
 * Strategies:
 *   1. If inside a string, close the string
 *   2. Close any unclosed arrays and objects
 *   3. Remove trailing commas
 */
function repairTruncatedJson(str: string): string {
  let result = str.trim();

  // Remove trailing comma (common truncation point)
  result = result.replace(/,\s*$/, "");

  // Count unclosed brackets
  let braces = 0; // {}
  let brackets = 0; // []
  let inString = false;
  let escape = false;

  for (let i = 0; i < result.length; i++) {
    const ch = result[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
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
