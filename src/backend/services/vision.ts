import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";

import { config, hasVision } from "@/backend/config";
import type { HazardId, ImageFindings } from "@/shared/types";

/**
 * Vision pass over a submitted photo.
 *
 * Returns findings on the SAME 0-100 scale and the SAME hazard vocabulary the
 * text rules use, so fusion is an arithmetic step rather than a translation
 * problem.
 *
 * This is strictly best-effort. No API key, an unsupported format, a network
 * failure or a malformed response all return `null`, and the request falls
 * back to text-only triage. A resident's submission must never fail because
 * an analysis service was unavailable.
 */

/** Formats the Messages API accepts. Notably excludes SVG. */
const SUPPORTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export function canAnalyze(mimeType: string): boolean {
  return hasVision() && SUPPORTED_MIME.has(mimeType);
}

const HAZARD_IDS = [
  "leaning",
  "falling",
  "property",
  "vehicle",
  "powerline",
  "trunk",
  "deadBranch",
  "storm",
  "road",
  "sidewalk",
] as const;

/**
 * Raw JSON Schema rather than a zod schema: the SDK's zod helper tracks zod v4
 * while this app uses v3 for form validation. Structured outputs work the same
 * either way.
 */
const FINDINGS_SCHEMA = {
  type: "object",
  properties: {
    usable: {
      type: "boolean",
      description:
        "True only if this photograph shows a tree or tree part that can be assessed",
    },
    rejection_reason: {
      type: "string",
      description:
        "If usable is false, one short sentence saying why. Empty string otherwise.",
    },
    severity: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description:
        "0 = healthy or cosmetic, 100 = actively failing onto people or property",
    },
    hazards: {
      type: "array",
      items: { type: "string", enum: HAZARD_IDS },
      description: "Every hazard visible in the photograph. Empty array if none.",
    },
    summary: {
      type: "string",
      description: "One sentence an arborist can act on. Max 25 words.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "How confident you are in this assessment",
    },
  },
  required: [
    "usable",
    "rejection_reason",
    "severity",
    "hazards",
    "summary",
    "confidence",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are a certified arborist assessing photographs attached to Halifax 311 tree service requests.

You are deciding INSPECTION PRIORITY from the photograph alone. Judge only what is visible. Do not infer from the caption or assume facts the image does not show.

SEVERITY SCALE (0-100)
- 85-100  Actively failing. Tree or limb already resting on a structure, vehicle or wire; trunk snapped or split through; root plate lifted out of the ground.
- 60-84   Imminent hazard. Pronounced lean over a target, hanging or detached limb suspended above a walkway or road, major trunk cavity or crack with a target beneath.
- 35-59   Real defect, no immediate failure path. Standing dead tree, substantial deadwood, significant decay or fungal brackets, minor wire contact.
- 10-34   Minor or routine. Small deadwood, light clearance issues, cosmetic damage.
- 0-9     No visible defect.

WEIGH THE TARGET. A defect above a sidewalk, road, house, car or play area is more urgent than the same defect over empty ground.

HAZARD VOCABULARY - use only these ids, only when visible:
  leaning      trunk leaning off vertical
  falling      already fallen, uprooted, or visibly unstable
  property     house, building, roof, garage or shed in the fall path
  vehicle      car, driveway or parking area beneath
  powerline    contact with or proximity to overhead wires
  trunk        split, cracked, cavitied or rotting trunk
  deadBranch   dead, broken or hanging limb
  storm        fresh storm damage (torn wood, debris field)
  road         obstructing a roadway
  sidewalk     obstructing a footpath

SET usable = false when the photograph is not assessable: it shows no tree, is too dark or blurred to judge, is a screenshot or document, or is unrelated to the request. Give severity 0 when unusable.

Be conservative with confidence when the photograph is partial, distant or poorly lit.`;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

export async function analyzeImage(
  data: Buffer,
  mimeType: string,
  description: string
): Promise<ImageFindings | null> {
  const anthropic = getClient();
  if (!anthropic || !SUPPORTED_MIME.has(mimeType)) return null;

  try {
    const response = await anthropic.messages.parse({
      model: config.visionModel,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: data.toString("base64"),
              },
            },
            {
              type: "text",
              text: `Assess this photograph for inspection priority.

The resident wrote the following. Use it only to understand what you are looking at - your severity must reflect what is VISIBLE, not what the text claims:

<resident_description>
${description}
</resident_description>`,
            },
          ],
        },
      ],
      output_config: { format: jsonSchemaOutputFormat(FINDINGS_SCHEMA) },
    });

    const parsed = response.parsed_output;
    if (!parsed) return null;

    return {
      usable: parsed.usable,
      severity: parsed.usable ? parsed.severity : 0,
      hazards: parsed.usable ? (parsed.hazards as HazardId[]) : [],
      summary: parsed.summary,
      confidence: parsed.confidence,
      model: config.visionModel,
      rejectionReason: parsed.usable ? null : parsed.rejection_reason || null,
    };
  } catch {
    // Rate limits, timeouts, refusals, schema failures: all non-fatal.
    return null;
  }
}
