import type {
  TreeComplaint,
  ScoredComplaint,
  ScoreBreakdown,
  Hazard,
  Priority,
  ReviewStatus,
  ImageDetectionResult,
} from "../types";

// ===== Street impact scores =====
const STREET_SCORES: Record<string, number> = {
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

const DEFAULT_STREET_SCORE = 40;
const QUIET_STREET_SCORE = 25;

const QUIET_STREETS = new Set<string>([
  "Brunswick Street",
  "Young Street",
  "South Park Street",
]);

// ===== Danger keyword matching =====
interface DangerRule {
  pattern: RegExp;
  label: string;
  points: number;
}

const DANGER_RULES: DangerRule[] = [
  { pattern: /leaning|significantly leaning/i, label: "Leaning Tree", points: 30 },
  { pattern: /falling|fallen|uprooted|unstable|could fall|fall on|falling branch/i, label: "Falling Risk", points: 25 },
  { pattern: /house|home|building|roof/i, label: "Property Threat", points: 20 },
  { pattern: /car|vehicle|driveway/i, label: "Vehicle Threat", points: 15 },
  { pattern: /power line|electrical wire|utility line|power lines|overhead wire|overhead utility wire|touching line/i, label: "Power Line Threat", points: 15 },
  { pattern: /trunk splitting|split trunk|cracked trunk|split in the trunk|splitting|bark split|bark peeling/i, label: "Split Trunk", points: 10 },
  { pattern: /large dead branch|hanging branch|broken limb|dead branch|large limb|large branch|deadwood|dead branches/i, label: "Dead Branch", points: 10 },
  { pattern: /storm damage|storm|wind storm|in wind|in the next storm|during.*wind/i, label: "Storm Damage", points: 10 },
  { pattern: /dead or dying|dead tree|dead for|completely bare|no foliage|no leaves/i, label: "Dead/Dying Tree", points: 20 },
  { pattern: /blocking road|blocking the road|across both lanes/i, label: "Road Obstruction", points: 5 },
  { pattern: /blocking sidewalk|sidewalk|tripping hazard|pedestrian/i, label: "Sidewalk Obstruction", points: 5 },
];

// ===== Vague description detection =====
const VAGUE_PATTERNS = [
  /^tree looks weird\.?$/i,
  /^something seems wrong with the tree/i,
  /^tree needs attention\.?$/i,
  /^please check this tree\.?$/i,
  /^tree doesn't look right/i,
  /^something is wrong with/i,
];

// ===== Exaggeration detection (anti-gaming) =====
const EXAGGERATION_PATTERNS = [
  /urgent/i,
  /emergency/i,
  /immediately/i,
  /someone could die/i,
  /deadly/i,
  /catastroph/i,
  /!!!+/,
];

function isVague(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.split(/\s+/).length < 8) {
    const hasHazard = DANGER_RULES.some((r) => r.pattern.test(trimmed));
    if (!hasHazard) return true;
  }
  return VAGUE_PATTERNS.some((p) => p.test(trimmed));
}

function countExaggerationCues(text: string): number {
  return EXAGGERATION_PATTERNS.reduce((count, p) => (p.test(text) ? count + 1 : count), 0);
}

// ===== Text-based danger scoring =====
function calculateTextDangerScore(text: string): { score: number; hazards: Hazard[] } {
  let score = 0;
  const hazards: Hazard[] = [];

  for (const rule of DANGER_RULES) {
    if (rule.pattern.test(text)) {
      score += rule.points;
      hazards.push({ label: rule.label, points: rule.points, source: "text" as const });
    }
  }

  // Anti-gaming: reduce score if exaggeration cues are present without
  // corresponding hazard keywords. This prevents citizens from inflating
  // their score with emotional language alone.
  const exaggerationCount = countExaggerationCues(text);
  const hasRealHazards = hazards.length > 0;
  if (exaggerationCount > 0 && !hasRealHazards) {
    // Pure exaggeration with no hazard keywords — penalize
    score = Math.max(0, score - exaggerationCount * 5);
  }

  return { score: Math.min(score, 100), hazards };
}

// ===== Image-based danger scoring (mock for MVP) =====
// In production, this would call the LLM with the system prompt from systemPrompt.ts.
// For the MVP, we simulate image detection results based on mock photo data.
// Some complaints have simulated image detections that may CONFIRM or CONTRADICT
// the text description — this is the anti-gaming feature.

// Mock image detections: keyed by complaint ID.
// These simulate what a vision LLM would return when analyzing the field photo.
const MOCK_IMAGE_DETECTIONS: Record<string, ImageDetectionResult> = {
  // TR-004: Text says "leaning heavily over house" — image CONFIRMS (genuine hazard)
  "TR-004": {
    hazards: [
      { label: "Leaning Tree", points: 30, source: "image" },
      { label: "Property Threat", points: 20, source: "image" },
      { label: "Storm Damage", points: 10, source: "image" },
    ],
    confidence: 0.92,
    summary: "Photo confirms large maple leaning approximately 40 degrees toward the house with visible storm damage to limbs over the roof.",
    hasImage: true,
  },
  // TR-013: Text says "needs trimming for aesthetics" — image shows NO hazard (genuine low)
  "TR-013": {
    hazards: [],
    confidence: 0.88,
    summary: "Photo shows a healthy tree with overgrown but non-hazardous branches. No leaning, dead limbs, or structural issues visible.",
    hasImage: true,
  },
  // TR-015: Text says "tree looks ugly" — image shows NO hazard (genuine low)
  "TR-015": {
    hazards: [],
    confidence: 0.85,
    summary: "Photo shows a healthy tree with uneven canopy. No structural hazards, leaning, or dead branches visible.",
    hasImage: true,
  },
  // TR-016: Text says "tree looks weird" (vague) — image shows a CRACKED TRUNK (image reveals real danger text missed)
  "TR-016": {
    hazards: [
      { label: "Split Trunk", points: 10, source: "image" },
      { label: "Dead Branch", points: 10, source: "image" },
    ],
    confidence: 0.78,
    summary: "Despite the vague text description, the photo reveals a visible vertical crack in the trunk and a dead branch hanging over the sidewalk.",
    hasImage: true,
  },
  // TR-020: Text says "please check this tree" (vague) — image shows NO hazard but poor quality
  "TR-020": {
    hazards: [],
    confidence: 0.35,
    summary: "Photo is too dark and blurry to assess. Cannot confirm or rule out hazards from the image.",
    hasImage: true,
  },
};

function getImageDetection(complaint: TreeComplaint): ImageDetectionResult | undefined {
  return MOCK_IMAGE_DETECTIONS[complaint.id];
}

function calculateImageDangerScore(detection: ImageDetectionResult | undefined): { score: number; hazards: Hazard[] } {
  if (!detection || !detection.hasImage) {
    return { score: 0, hazards: [] };
  }
  let score = 0;
  const hazards: Hazard[] = [];
  for (const h of detection.hazards) {
    score += h.points;
    hazards.push({ ...h, source: "image" as const });
  }
  return { score: Math.min(score, 100), hazards };
}

// ===== Combined danger score with text-image conflict detection =====
function calculateCombinedDangerScore(
  textResult: { score: number; hazards: Hazard[] },
  imageResult: { score: number; hazards: Hazard[] },
  imageDetection: ImageDetectionResult | undefined
): {
  score: number;
  hazards: Hazard[];
  textImageConflict: boolean;
} {
  // Merge hazards (deduplicate by label, prefer image source)
  const hazardMap = new Map<string, Hazard>();
  for (const h of textResult.hazards) {
    hazardMap.set(h.label, h);
  }
  for (const h of imageResult.hazards) {
    hazardMap.set(h.label, h); // image overrides text for same hazard
  }
  const mergedHazards = Array.from(hazardMap.values());

  let combinedScore: number;
  let textImageConflict = false;

  if (imageDetection && imageDetection.hasImage && imageDetection.confidence > 0.5) {
    // We have a usable image — weight image evidence higher (anti-gaming)
    // Image gets 65% weight, text gets 35% weight
    // This means a dramatic text description can't override what the photo shows
    combinedScore = Math.round(imageResult.score * 0.65 + textResult.score * 0.35);

    // Detect conflict: text describes high danger but image shows low danger (or vice versa)
    const textHigh = textResult.score >= 50;
    const imageHigh = imageResult.score >= 50;
    const textLow = textResult.score < 20;
    const imageLow = imageResult.score < 20;

    if ((textHigh && imageLow) || (textLow && imageHigh)) {
      textImageConflict = true;
    }

    // If conflict detected, lean even more toward image evidence
    if (textImageConflict) {
      combinedScore = Math.round(imageResult.score * 0.80 + textResult.score * 0.20);
    }
  } else if (imageDetection && imageDetection.hasImage && imageDetection.confidence <= 0.5) {
    // Image exists but is low quality — rely mostly on text but flag for review
    combinedScore = Math.round(textResult.score * 0.80 + imageResult.score * 0.20);
  } else {
    // No image at all — use text score but it's less reliable
    combinedScore = textResult.score;
  }

  return {
    score: Math.min(combinedScore, 100),
    hazards: mergedHazards,
    textImageConflict,
  };
}

// ===== Other scoring functions =====

function calculateWaitScore(daysWaiting: number): number {
  return Math.min((daysWaiting / 180) * 100, 100);
}

function calculateLocationScore(street: string): number {
  if (STREET_SCORES[street] !== undefined) return STREET_SCORES[street];
  if (QUIET_STREETS.has(street)) return QUIET_STREET_SCORE;
  return DEFAULT_STREET_SCORE;
}

function calculateReviewScore(
  text: string,
  imageDetection: ImageDetectionResult | undefined
): { score: number; status: ReviewStatus } {
  // Unsure if: vague text AND no usable image, OR image is low confidence, OR no image at all
  const vague = isVague(text);
  const hasUsableImage = imageDetection && imageDetection.hasImage && imageDetection.confidence > 0.5;

  if (vague && !hasUsableImage) {
    return { score: 100, status: "Unsure" };
  }
  if (imageDetection && imageDetection.hasImage && imageDetection.confidence <= 0.5) {
    return { score: 100, status: "Unsure" };
  }
  if (!imageDetection || !imageDetection.hasImage) {
    // No image — if text is also vague, unsure. Otherwise still reviewed but less confident.
    if (vague) return { score: 100, status: "Unsure" };
    return { score: 50, status: "Reviewed" };
  }
  return { score: 0, status: "Reviewed" };
}

function getPriority(finalScore: number): Priority {
  if (finalScore >= 80) return "Critical";
  if (finalScore >= 60) return "High";
  if (finalScore >= 35) return "Medium";
  return "Low";
}

function generateReasoning(
  complaint: TreeComplaint,
  scores: ScoreBreakdown,
  hazards: Hazard[],
  reviewStatus: ReviewStatus,
  imageDetection: ImageDetectionResult | undefined,
  textImageConflict: boolean
): string {
  const parts: string[] = [];

  // Source-aware hazard description
  const textHazards = hazards.filter((h) => h.source === "text");
  const imageHazards = hazards.filter((h) => h.source === "image");

  if (textHazards.length > 0 && imageHazards.length > 0) {
    parts.push(`The description mentions ${textHazards.map((h) => h.label.toLowerCase()).join(", ")}, which is confirmed by the field photo`);
  } else if (imageHazards.length > 0 && textHazards.length === 0) {
    parts.push(`The field photo detected ${imageHazards.map((h) => h.label.toLowerCase()).join(", ")} that the text description did not mention`);
  } else if (textHazards.length > 0) {
    parts.push(`The description mentions ${textHazards.map((h) => h.label.toLowerCase()).join(", ")}`);
  } else {
    parts.push("No specific hazards were detected from the complaint text or field photo");
  }

  if (textImageConflict) {
    parts.push("A conflict was detected between the text description and the field photo — the photo evidence was weighted more heavily to prevent exaggeration");
  }

  if (scores.waitScore > 0) {
    parts.push(`The complaint has been waiting ${complaint.daysWaiting} days`);
  }

  if (scores.locationScore >= 75) {
    parts.push(`The location is on ${complaint.street}, increasing the potential public impact`);
  } else if (scores.locationScore >= 40) {
    parts.push(`The location is on ${complaint.street}, a residential area`);
  }

  if (reviewStatus === "Unsure") {
    if (imageDetection && imageDetection.confidence <= 0.5) {
      parts.push("The field photo is too low quality to assess and the description requires human review");
    } else {
      parts.push("The description is vague and requires human review");
    }
  }

  const priority = getPriority(scores.finalScore);
  const qualifier =
    priority === "Critical" ? "Critical priority"
    : priority === "High" ? "High priority"
    : priority === "Medium" ? "Medium priority"
    : "Low priority";

  return `${qualifier} — ${parts.join(". ")}.`;
}

// ===== Main scoring function =====
export function scoreComplaint(complaint: TreeComplaint): ScoredComplaint {
  const textResult = calculateTextDangerScore(complaint.complaintText);
  const imageDetection = getImageDetection(complaint);
  const imageResult = calculateImageDangerScore(imageDetection);

  const { score: dangerScore, hazards, textImageConflict } = calculateCombinedDangerScore(
    textResult,
    imageResult,
    imageDetection
  );

  const waitScore = calculateWaitScore(complaint.daysWaiting);
  const locationScore = calculateLocationScore(complaint.street);
  const { score: reviewScore, status: reviewStatus } = calculateReviewScore(
    complaint.complaintText,
    imageDetection
  );

  const finalScore = Math.round(
    dangerScore * 0.50 + waitScore * 0.25 + locationScore * 0.15 + reviewScore * 0.10
  );

  const scores: ScoreBreakdown = {
    textDangerScore: textResult.score,
    imageDangerScore: imageResult.score,
    dangerScore,
    waitScore,
    locationScore,
    reviewScore,
    finalScore,
  };

  const priority = getPriority(finalScore);
  const reasoning = generateReasoning(
    complaint,
    scores,
    hazards,
    reviewStatus,
    imageDetection,
    textImageConflict
  );

  return {
    ...complaint,
    scores,
    hazards,
    imageDetection,
    priority,
    reviewStatus,
    reasoning,
    textImageConflict,
  };
}

export function scoreAllComplaints(complaints: TreeComplaint[]): ScoredComplaint[] {
  return complaints.map(scoreComplaint).sort((a, b) => b.scores.finalScore - a.scores.finalScore);
}

// ===== AI-powered scoring (uses real LLM analysis from backend) =====

/**
 * Score a complaint using real LLM image analysis results.
 * This replaces the mock image detection with actual AI output.
 *
 * @param complaint     — the complaint to score
 * @param aiAnalysis    — LLM analysis result from the backend /api/analyze-hazard endpoint
 * @returns             — ScoredComplaint with AI-powered danger score
 */
export function scoreComplaintWithAI(
  complaint: TreeComplaint,
  aiAnalysis: {
    dangerScore: number;
    hazards: { label: string; points: number; source: "image" }[];
    isUnsure: boolean;
    textImageConflict: boolean;
    confidence: number;
    reasoning: string;
    hasImage: boolean;
    summary: string;
  }
): ScoredComplaint {
  const textResult = calculateTextDangerScore(complaint.complaintText);

  // Build image detection result from AI analysis
  const imageDetection: ImageDetectionResult = {
    hazards: aiAnalysis.hazards.map((h) => ({
      label: h.label,
      points: h.points,
      source: "image" as const,
    })),
    confidence: aiAnalysis.confidence,
    summary: aiAnalysis.summary,
    hasImage: aiAnalysis.hasImage,
  };

  const imageResult = calculateImageDangerScore(imageDetection);

  // Use AI's danger score as the combined danger score
  // but still merge hazards from both text and image
  const { hazards } = calculateCombinedDangerScore(
    textResult,
    imageResult,
    imageDetection
  );

  // Override with AI's danger score and conflict detection
  const dangerScore = aiAnalysis.dangerScore;
  const aiConflict = aiAnalysis.textImageConflict;

  const waitScore = calculateWaitScore(complaint.daysWaiting);
  const locationScore = calculateLocationScore(complaint.street);
  const { score: reviewScore, status: reviewStatus } = calculateReviewScore(
    complaint.complaintText,
    imageDetection
  );

  // If AI says unsure, override review status
  const finalReviewStatus: ReviewStatus = aiAnalysis.isUnsure ? "Unsure" : reviewStatus;
  const finalReviewScore = aiAnalysis.isUnsure ? 100 : reviewScore;

  const finalScore = Math.round(
    dangerScore * 0.50 + waitScore * 0.25 + locationScore * 0.15 + finalReviewScore * 0.10
  );

  const scores: ScoreBreakdown = {
    textDangerScore: textResult.score,
    imageDangerScore: imageResult.score,
    dangerScore,
    waitScore,
    locationScore,
    reviewScore: finalReviewScore,
    finalScore,
  };

  const priority = getPriority(finalScore);

  // Use AI reasoning if available, otherwise generate our own
  const reasoning = aiAnalysis.reasoning || generateReasoning(
    complaint,
    scores,
    hazards,
    finalReviewStatus,
    imageDetection,
    aiConflict
  );

  return {
    ...complaint,
    scores,
    hazards,
    imageDetection,
    priority,
    reviewStatus: finalReviewStatus,
    reasoning,
    textImageConflict: aiConflict,
  };
}
