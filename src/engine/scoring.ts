import type {
  Assessment,
  Classification,
  DetectedHazard,
  Fusion,
  HazardId,
  ImageFindings,
  PriorityLevel,
  ReviewStatus,
} from "../lib/types";

/**
 * Deterministic triage engine.
 *
 * Split into two halves on purpose:
 *
 *   classifyComplaint(text)  -> Classification   EXPENSIVE, ran once, PERSISTED
 *   scoreRequest(cls, ctx)   -> Assessment       CHEAP, recomputed EVERY READ
 *
 * Wait time changes daily, so a final score written to the database would be
 * wrong by the next morning. Only findings derived from the complaint itself
 * are stored; the weighting, escalation and priority are always live.
 *
 * SWAPPING IN AN LLM
 * ------------------
 * `classifyComplaint` is the only function that reads free text. Replace it
 * with a model call returning the same `Classification` shape - adding image
 * findings under `source: "fused"` - and the weighting, thresholds, reasoning
 * and UI keep working unchanged.
 */

/** Bump when rules change so persisted rows can be identified as stale. */
export const ENGINE_VERSION = "fused-v1";

// ---------------------------------------------------------------------------
// Danger score - 50%
// ---------------------------------------------------------------------------

interface HazardRule {
  id: HazardId;
  label: string;
  points: number;
  phrase: string;
  patterns: RegExp[];
}

export const HAZARD_RULES: HazardRule[] = [
  {
    id: "leaning",
    label: "Leaning",
    points: 30,
    phrase: "a leaning tree",
    patterns: [/\blean(s|ing|ed)?\b/i, /\btilt(s|ing|ed)?\b/i, /\d+\s*degrees?\b/i],
  },
  {
    id: "falling",
    label: "Falling Risk",
    points: 25,
    phrase: "signs that the tree may come down",
    patterns: [
      /\bfall(s|en|ing)?\b/i,
      /\buproot(ed|ing)?\b/i,
      /\bunstable\b/i,
      /\bcame down\b/i,
      /\bcollaps(e|ed|ing)\b/i,
      /\broots?\s+(are\s+)?(lifted|exposed|pulling)/i,
    ],
  },
  {
    id: "property",
    label: "Property Threat",
    points: 20,
    phrase: "a house or building in the fall path",
    patterns: [
      /\bhouse\b/i,
      /\bhomes?\b/i,
      /\bbuilding\b/i,
      /\broof\b/i,
      /\bgarage\b/i,
      /\bporch\b/i,
      /\bshed\b/i,
    ],
  },
  {
    id: "vehicle",
    label: "Vehicle Threat",
    points: 15,
    phrase: "vehicles or a driveway underneath",
    patterns: [/\bcars?\b/i, /\bvehicles?\b/i, /\bdriveway\b/i, /\bparking\b/i],
  },
  {
    id: "powerline",
    label: "Power Line",
    points: 15,
    phrase: "contact with overhead power lines",
    patterns: [
      /\bpower\s*lines?\b/i,
      /\belectric(al)?\s*(wire|line)s?\b/i,
      /\butility\s*lines?\b/i,
      /\bhydro\s*lines?\b/i,
      /\bwires?\b/i,
      /\bsparking\b/i,
      /\barcing\b/i,
    ],
  },
  {
    id: "trunk",
    label: "Trunk Damage",
    points: 10,
    phrase: "a split or cracked trunk",
    patterns: [
      /\btrunk\b[^.]{0,40}\b(split|splitting|crack|cracked|cracking|hollow|rot)/i,
      /\b(split|splitting|crack|cracked|cracking|hollow|rotted|rotting)\b[^.]{0,40}\btrunk\b/i,
      /\bsplit(ting)?\s+down\s+the\s+(main\s+)?(trunk|fork)\b/i,
      /\bbase\s+(appears|is|looks)\s+(cracked|split|rotted)/i,
    ],
  },
  {
    id: "deadBranch",
    label: "Dead Branch",
    points: 10,
    phrase: "a dead or hanging limb overhead",
    patterns: [
      /\bdead\s+(branch|branches|limb|limbs|tree)\b/i,
      /\bhanging\s+(branch|branches|limb|limbs)\b/i,
      /\b(branch|branches|limb|limbs)\b[^.]{0,30}\bhanging\b/i,
      /\bbroken\s+(branch|branches|limb|limbs)\b/i,
      /\bcracked\s+(branch|branches|limb|limbs)\b/i,
      /\bwidow\s*maker\b/i,
    ],
  },
  {
    id: "storm",
    label: "Storm Damage",
    points: 10,
    phrase: "recent storm damage",
    patterns: [
      /\bstorm\b/i,
      /\bhurricane\b/i,
      /\bhigh\s+winds?\b/i,
      /\bwind\s*storm\b/i,
      /\bafter\s+(last\s+night|the\s+weekend)/i,
    ],
  },
  {
    id: "road",
    label: "Road Obstruction",
    points: 5,
    phrase: "an obstruction in the roadway",
    patterns: [
      /\bblock(s|ing|ed)?\b[^.]{0,25}\b(road|street|lane|traffic|intersection)\b/i,
      /\b(road|street|lane)\b[^.]{0,25}\bblock(s|ing|ed)?\b/i,
      /\bpartially\s+onto\s+the\s+(road|street)\b/i,
    ],
  },
  {
    id: "sidewalk",
    label: "Sidewalk Obstruction",
    points: 5,
    phrase: "an obstruction on the sidewalk",
    patterns: [
      /\bblock(s|ing|ed)?\b[^.]{0,25}\b(sidewalk|walkway|footpath|crosswalk)\b/i,
      /\b(sidewalk|walkway|footpath)\b[^.]{0,25}\bblock(s|ing|ed)?\b/i,
      /\bover\s+the\s+sidewalk\b/i,
    ],
  },
];

export const MAX_DANGER_SCORE = 100;

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

export function detectHazards(complaintText: string): DetectedHazard[] {
  const found: DetectedHazard[] = [];
  for (const rule of HAZARD_RULES) {
    const evidence = firstMatch(complaintText, rule.patterns);
    if (evidence) {
      found.push({
        id: rule.id,
        label: rule.label,
        points: rule.points,
        evidence,
        phrase: rule.phrase,
      });
    }
  }
  return found;
}

export function calculateDangerScore(hazards: DetectedHazard[]): number {
  const total = hazards.reduce((sum, hazard) => sum + hazard.points, 0);
  return Math.min(total, MAX_DANGER_SCORE);
}

// ---------------------------------------------------------------------------
// Wait time score - 25%
// ---------------------------------------------------------------------------

export const WAIT_SATURATION_DAYS = 180;

export function calculateWaitScore(daysWaiting: number): number {
  const raw = (Math.max(daysWaiting, 0) / WAIT_SATURATION_DAYS) * 100;
  return Math.min(raw, 100);
}

/** Whole days between submission and now. Single source of truth for wait time. */
export function daysSince(submittedAt: string, now: Date = new Date()): number {
  const submitted = new Date(submittedAt).getTime();
  if (Number.isNaN(submitted)) return 0;
  const days = Math.floor((now.getTime() - submitted) / 86_400_000);
  return Math.max(days, 0);
}

// ---------------------------------------------------------------------------
// Location impact - 15%
// ---------------------------------------------------------------------------

export const MAJOR_STREET_SCORES: Record<string, number> = {
  "Barrington Street": 100,
  "Spring Garden Road": 100,
  "Quinpool Road": 90,
  "Robie Street": 90,
  "Gottingen Street": 85,
  "Oxford Street": 80,
  "Windsor Street": 80,
  "Almon Street": 80,
  "Chebucto Road": 75,
  "Dutch Village Road": 75,
};

export const RESIDENTIAL_STREET_SCORE = 40;
export const QUIET_STREET_SCORE = 25;

export const QUIET_STREETS = new Set<string>([
  "Preston Street",
  "Jubilee Road",
  "Vernon Street",
  "Seaforth Street",
  "Lawrence Street",
  "Edward Street",
  "Cork Street",
  "Pepperell Street",
]);

export function calculateLocationScore(street: string): number {
  const major = MAJOR_STREET_SCORES[street];
  if (major !== undefined) return major;
  if (QUIET_STREETS.has(street)) return QUIET_STREET_SCORE;
  return RESIDENTIAL_STREET_SCORE;
}

export function describeLocationImpact(score: number): string {
  if (score >= 90) return "a major arterial route with heavy foot and vehicle traffic";
  if (score >= 75) return "a busy through street with steady public exposure";
  if (score > QUIET_STREET_SCORE) return "a residential street with moderate public exposure";
  return "a quiet local street with limited public exposure";
}

// ---------------------------------------------------------------------------
// Human review - 10%
// ---------------------------------------------------------------------------

const VAGUE_PATTERNS: RegExp[] = [
  /\blooks?\s+(weird|strange|odd|funny|off|wrong)\b/i,
  /\bsomething\s+(seems|looks|is|feels)\s+(wrong|off|strange|weird)\b/i,
  /\bdoes\s*n[o']?t\s+look\s+right\b/i,
  /\bneeds?\s+attention\b/i,
  /\bplease\s+(check|look\s+at|inspect|send\s+someone)\b/i,
  /\bnot\s+sure\s+what\b/i,
  /\bcan\s+someone\s+(come|take)\s+a?\s*look\b/i,
  /\bneighbou?r\s+(said|told\s+me)\b/i,
];

const COSMETIC_PATTERNS: RegExp[] = [
  /\btrim(med|ming)?\b/i,
  /\bprun(e|ed|ing)\b/i,
  /\bugly\b/i,
  /\bunsightly\b/i,
  /\bleaves\b/i,
  /\bsap\b/i,
  /\bacorns?\b/i,
  /\bgutters?\b/i,
  /\bmessy\b/i,
  /\bview\b/i,
  /\bstake\b/i,
];

const MIN_INFORMATIVE_WORDS = 12;

/**
 * Vague language still wins below this danger score. A phrase like "something
 * seems wrong with the tree behind my house" trips the Property rule on the
 * word "house", but "house" there is a locator, not a described threat - so a
 * lone weak hazard hit must not suppress the review flag.
 */
const VAGUE_DANGER_CEILING = 25;

export interface VaguenessResult {
  isVague: boolean;
  note: string;
}

export function detectVagueness(
  complaintText: string,
  hazards: DetectedHazard[],
  dangerScore: number
): VaguenessResult {
  const wordCount = complaintText.trim().split(/\s+/).filter(Boolean).length;
  const matchedVague = firstMatch(complaintText, VAGUE_PATTERNS);
  const isCosmetic = COSMETIC_PATTERNS.some((pattern) => pattern.test(complaintText));

  if (matchedVague && dangerScore < VAGUE_DANGER_CEILING) {
    return {
      isVague: true,
      note: `The description relies on non-specific language ("${matchedVague}") and names no clearly observable defect.`,
    };
  }

  if (hazards.length === 0 && !isCosmetic && wordCount < MIN_INFORMATIVE_WORDS) {
    return {
      isVague: true,
      note: `Only ${wordCount} words were submitted and no observable defect was named.`,
    };
  }

  if (hazards.length === 0) {
    return {
      isVague: false,
      note: "Reads as routine maintenance. No hazard indicators and no ambiguity.",
    };
  }

  return {
    isVague: false,
    note: `${hazards.length} hazard indicator${hazards.length === 1 ? "" : "s"} identified in the text.`,
  };
}

// ---------------------------------------------------------------------------
// Classification - persisted
// ---------------------------------------------------------------------------

/**
 * The single text-understanding boundary in the app. Runs once at submission;
 * the result is written to `assessments`.
 */
export function classifyComplaint(
  complaintText: string,
  now: Date = new Date()
): Classification {
  const hazards = detectHazards(complaintText);
  const dangerScore = calculateDangerScore(hazards);
  const vagueness = detectVagueness(complaintText, hazards, dangerScore);

  return {
    hazards,
    dangerScore,
    reviewStatus: vagueness.isVague ? "Unsure" : "Reviewed",
    reviewNote: vagueness.note,
    imageFindings: null,
    fusion: {
      verdict: "text-only",
      textDanger: dangerScore,
      imageDanger: null,
      note: "No photograph was analyzed. Score is based on the description alone.",
    },
    engineVersion: ENGINE_VERSION,
    source: "text",
    computedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Fusing the image verdict with the text verdict
// ---------------------------------------------------------------------------

/** Difference in danger points below which the two sources count as agreeing. */
const FUSION_AGREEMENT_BAND = 20;

/** Minimum image severity that can rescue an otherwise-vague complaint. */
const VAGUENESS_RESCUE_SEVERITY = 35;

const HAZARD_LABELS: Record<HazardId, string> = Object.fromEntries(
  HAZARD_RULES.map((rule) => [rule.id, rule.label])
) as Record<HazardId, string>;

const HAZARD_PHRASES: Record<HazardId, string> = Object.fromEntries(
  HAZARD_RULES.map((rule) => [rule.id, rule.phrase])
) as Record<HazardId, string>;

/** Turns image-only hazard ids into displayable hazards, tagged as visual. */
function hazardsFromImage(
  ids: HazardId[],
  alreadyFound: DetectedHazard[]
): DetectedHazard[] {
  const seen = new Set(alreadyFound.map((hazard) => hazard.id));
  return ids
    .filter((id) => !seen.has(id) && HAZARD_LABELS[id] !== undefined)
    .map((id) => ({
      id,
      label: HAZARD_LABELS[id],
      // Image hazards contribute no points directly: the image severity is
      // already folded into the fused danger score, so adding points here
      // would double-count the same evidence.
      points: 0,
      evidence: "visible in the submitted photograph",
      phrase: HAZARD_PHRASES[id],
    }));
}

/**
 * Reconciles what the photo shows with what the resident wrote.
 *
 * POLICY, and why:
 *
 *  - The fused score is never LOWER than the text score. Under-ranking a
 *    hazard someone described is the expensive mistake; over-ranking costs a
 *    wasted site visit.
 *  - A usable photo that is clearly worse than the text RAISES the score. The
 *    photo is evidence; the words were just a lay description.
 *  - Text that claims far more than the photo supports keeps the higher score
 *    but is FLAGGED for human review, rather than silently trusted or
 *    silently discounted.
 *  - A usable photo showing a real defect CLEARS the vague-text flag. This is
 *    the case the review queue exists for: "Tree looks weird" plus a picture
 *    of a split trunk is no longer ambiguous.
 *  - An unusable photo (not a tree, too dark, a screenshot) FLAGS for review.
 *    Someone uploaded something; a human should see what.
 */
export function fuseClassification(
  textClassification: Classification,
  findings: ImageFindings | null,
  now: Date = new Date()
): Classification {
  const textDanger = textClassification.dangerScore;

  if (!findings) return textClassification;

  const base = {
    ...textClassification,
    imageFindings: findings,
    source: "fused" as const,
    computedAt: now.toISOString(),
  };

  if (!findings.usable) {
    const fusion: Fusion = {
      verdict: "image-unusable",
      textDanger,
      imageDanger: null,
      note: `The submitted photograph could not be assessed${
        findings.rejectionReason ? `: ${findings.rejectionReason}` : "."
      } Scored on the description alone and flagged for a human look.`,
    };
    return {
      ...base,
      dangerScore: textDanger,
      reviewStatus: "Unsure",
      reviewNote: fusion.note,
      fusion,
    };
  }

  const imageDanger = findings.severity;
  const delta = imageDanger - textDanger;
  const extraHazards = hazardsFromImage(findings.hazards, textClassification.hazards);
  const hazards = [...textClassification.hazards, ...extraHazards];

  // A photo showing a genuine defect resolves an ambiguous description.
  if (
    textClassification.reviewStatus === "Unsure" &&
    imageDanger >= VAGUENESS_RESCUE_SEVERITY
  ) {
    const fusion: Fusion = {
      verdict: "image-resolved-vagueness",
      textDanger,
      imageDanger,
      note: `The description was too vague to score, but the photograph shows an assessable defect (${findings.summary}). Scored from the image and cleared for dispatch.`,
    };
    return {
      ...base,
      hazards,
      dangerScore: Math.max(textDanger, imageDanger),
      reviewStatus: "Reviewed",
      reviewNote: fusion.note,
      fusion,
    };
  }

  if (delta > FUSION_AGREEMENT_BAND) {
    const fusion: Fusion = {
      verdict: "image-worse",
      textDanger,
      imageDanger,
      note: `The photograph shows more than the description conveyed (${findings.summary}). Danger raised from ${textDanger} to ${imageDanger}.`,
    };
    return {
      ...base,
      hazards,
      dangerScore: imageDanger,
      reviewNote: fusion.note,
      fusion,
    };
  }

  if (delta < -FUSION_AGREEMENT_BAND) {
    const fusion: Fusion = {
      verdict: "text-worse",
      textDanger,
      imageDanger,
      note: `The description implies a more serious hazard (${textDanger}) than the photograph supports (${imageDanger}: ${findings.summary}). Kept the higher score and flagged for human review.`,
    };
    return {
      ...base,
      hazards,
      dangerScore: textDanger,
      reviewStatus: "Unsure",
      reviewNote: fusion.note,
      fusion,
    };
  }

  const fused = Math.max(textDanger, imageDanger);
  const fusion: Fusion = {
    verdict: "agree",
    textDanger,
    imageDanger,
    note: `Photograph and description agree (${findings.summary}).`,
  };
  return {
    ...base,
    hazards,
    dangerScore: fused,
    fusion,
  };
}

// ---------------------------------------------------------------------------
// Priority levels and weights
// ---------------------------------------------------------------------------

export function getPriorityLevel(finalScore: number): PriorityLevel {
  if (finalScore >= 80) return "Critical";
  if (finalScore >= 60) return "High";
  if (finalScore >= 35) return "Medium";
  return "Low";
}

export const WEIGHTS = {
  danger: 0.5,
  wait: 0.25,
  location: 0.15,
  review: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Imminent-hazard escalation floor
// ---------------------------------------------------------------------------

/**
 * The weighted formula alone cannot express urgency for a brand-new report. A
 * tree actively falling onto a house, reported today on a residential street,
 * tops out at:
 *
 *   danger 100*0.50 + wait 0*0.25 + location 40*0.15 + review 0*0.10 = 56
 *
 * ...which lands in "Medium". Backlog age would outrank an active hazard. So
 * severity sets a FLOOR on the final score, like the severity rows in a
 * municipal risk matrix. It never lowers a score and never alters the four
 * component scores, which still display as calculated.
 */
export const ESCALATION_RULES: Array<{
  minDanger: number;
  floor: number;
  level: PriorityLevel;
}> = [
  { minDanger: 70, floor: 80, level: "Critical" },
  { minDanger: 50, floor: 60, level: "High" },
];

export interface EscalationResult {
  score: number;
  escalated: boolean;
  reason: string | null;
}

export function applyEscalation(
  weightedScore: number,
  dangerScore: number
): EscalationResult {
  for (const rule of ESCALATION_RULES) {
    if (dangerScore >= rule.minDanger && weightedScore < rule.floor) {
      return {
        score: rule.floor,
        escalated: true,
        reason: `Danger score of ${dangerScore} meets the ${rule.level} escalation threshold (${rule.minDanger}+), so the priority is floored at ${rule.floor} regardless of wait time or location.`,
      };
    }
  }
  return { score: weightedScore, escalated: false, reason: null };
}

// ---------------------------------------------------------------------------
// Reasoning
// ---------------------------------------------------------------------------

function joinClauses(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function buildReasoning(params: {
  priority: PriorityLevel;
  hazards: DetectedHazard[];
  daysWaiting: number;
  street: string;
  locationScore: number;
  reviewStatus: ReviewStatus;
  escalationReason: string | null;
  fusion?: Fusion;
}): string {
  const { priority, hazards, daysWaiting, street, locationScore, reviewStatus } = params;
  const sentences: string[] = [];

  if (hazards.length > 0) {
    const top = hazards.slice(0, 4).map((hazard) => hazard.phrase);
    sentences.push(
      `${priority} priority because the description mentions ${joinClauses(top)}.`
    );
  } else if (reviewStatus === "Unsure") {
    sentences.push(
      `${priority} priority on wait time and location alone - the description names no observable defect the engine can score.`
    );
  } else {
    sentences.push(
      `${priority} priority because the description reads as routine maintenance with no hazard indicators.`
    );
  }

  if (daysWaiting >= WAIT_SATURATION_DAYS) {
    sentences.push(
      `It has been waiting ${daysWaiting} days, past the ${WAIT_SATURATION_DAYS}-day point where the backlog factor maxes out.`
    );
  } else if (daysWaiting >= 60) {
    sentences.push(`The complaint has also been waiting ${daysWaiting} days.`);
  } else {
    sentences.push(
      `It was submitted ${daysWaiting} days ago, so backlog pressure is still low.`
    );
  }

  sentences.push(`The location is on ${street}, ${describeLocationImpact(locationScore)}.`);

  if (params.fusion && params.fusion.verdict !== "text-only") {
    sentences.push(params.fusion.note);
  }

  if (params.escalationReason) {
    sentences.push(
      "Because the described hazard is severe, the imminent-hazard rule raised this above what wait time and location alone would give it."
    );
  }

  if (reviewStatus === "Unsure") {
    sentences.push(
      "Flagged for human review: an arborist should contact the resident for detail before a crew is dispatched."
    );
  }

  return sentences.join(" ");
}

// ---------------------------------------------------------------------------
// Scoring - recomputed on every read
// ---------------------------------------------------------------------------

export interface ScoringContext {
  daysWaiting: number;
  street: string;
}

export function scoreRequest(
  classification: Classification,
  context: ScoringContext
): Assessment {
  const danger = classification.dangerScore;
  const wait = calculateWaitScore(context.daysWaiting);
  const location = calculateLocationScore(context.street);
  const review = classification.reviewStatus === "Unsure" ? 100 : 0;

  const weightedScore = Math.round(
    danger * WEIGHTS.danger +
      wait * WEIGHTS.wait +
      location * WEIGHTS.location +
      review * WEIGHTS.review
  );

  const escalation = applyEscalation(weightedScore, danger);
  const finalScore = escalation.score;
  const priority = getPriorityLevel(finalScore);

  return {
    finalScore,
    weightedScore,
    priority,
    breakdown: {
      danger: Math.round(danger),
      wait: Math.round(wait),
      location: Math.round(location),
      review,
    },
    hazards: classification.hazards,
    escalated: escalation.escalated,
    escalationReason: escalation.reason,
    reviewStatus: classification.reviewStatus,
    reviewNote: classification.reviewNote,
    imageFindings: classification.imageFindings,
    fusion: classification.fusion,
    reasoning: buildReasoning({
      priority,
      hazards: classification.hazards,
      daysWaiting: context.daysWaiting,
      street: context.street,
      locationScore: location,
      reviewStatus: classification.reviewStatus,
      escalationReason: escalation.reason,
      fusion: classification.fusion,
    }),
  };
}

/** Classify and score in one step. Convenience for tests and one-off scoring. */
export function assess(input: {
  description: string;
  daysWaiting: number;
  street: string;
}): Assessment {
  return scoreRequest(classifyComplaint(input.description), {
    daysWaiting: input.daysWaiting,
    street: input.street,
  });
}
