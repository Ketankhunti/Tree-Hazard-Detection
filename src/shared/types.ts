// ---------------------------------------------------------------------------
// Request lifecycle
// ---------------------------------------------------------------------------

export const REQUEST_STATUSES = [
  "Submitted",
  "Triaged",
  "Scheduled",
  "In Progress",
  "Completed",
  "Duplicate",
  "Rejected",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Statuses that keep a request in the active inspection queue. */
export const OPEN_STATUSES: RequestStatus[] = [
  "Submitted",
  "Triaged",
  "Scheduled",
  "In Progress",
];

/** Statuses that take a request out of the queue for good. */
export const CLOSED_STATUSES: RequestStatus[] = [
  "Completed",
  "Duplicate",
  "Rejected",
];

/** How a request's coordinates were obtained. Drives trust in clustering. */
export type LocationSource = "exif" | "geocoded" | "manual" | "seed";

// ---------------------------------------------------------------------------
// Intake record (what the resident submitted)
// ---------------------------------------------------------------------------

export interface TreeRequest {
  id: string;
  /** Human-facing reference shown to the resident, e.g. HFX-2026-0043. */
  reference: string;
  reporterName: string;
  reporterEmail: string;
  /** Address exactly as the resident typed it. */
  address: string;
  /** Normalized street name; drives the location-impact score. */
  street: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: LocationSource;
  description: string;
  submittedAt: string;
  status: RequestStatus;
  /** Set when this report is a second sighting of an already-known tree. */
  duplicateOfId: string | null;
  /** Crew hours budgeted for the job. Used by same-day bundling. */
  estimatedHours: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestImage {
  id: string;
  requestId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  /** Coordinates lifted from photo EXIF, when the phone recorded them. */
  exifLatitude: number | null;
  exifLongitude: number | null;
  createdAt: string;
}

export interface StatusChange {
  id: number;
  requestId: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actor: string;
  note: string | null;
  createdAt: string;
}

export interface Feedback {
  id: number;
  requestId: string;
  rating: number | null;
  comment: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Hazard classification (the expensive half - computed once, persisted)
// ---------------------------------------------------------------------------

export type HazardId =
  | "leaning"
  | "falling"
  | "property"
  | "vehicle"
  | "powerline"
  | "trunk"
  | "deadBranch"
  | "storm"
  | "road"
  | "sidewalk";

export interface DetectedHazard {
  id: HazardId;
  label: string;
  points: number;
  /** Phrase from the complaint that triggered the rule - shown for auditability. */
  evidence: string;
  /** Clause used when assembling the reasoning sentence. */
  phrase: string;
}

export type ReviewStatus = "Unsure" | "Reviewed";

// ---------------------------------------------------------------------------
// Image analysis
// ---------------------------------------------------------------------------

/** What the vision pass saw in a submitted photo. */
export interface ImageFindings {
  /** False when the photo is not usable evidence (not a tree, too dark, etc). */
  usable: boolean;
  /** 0-100 on the same scale as the text danger score. */
  severity: number;
  /** Mapped onto the same hazard vocabulary the text rules use. */
  hazards: HazardId[];
  /** One sentence an arborist can read. */
  summary: string;
  /** Model's own confidence, 0-1. */
  confidence: number;
  model: string;
  /** Why the photo was rejected, when `usable` is false. */
  rejectionReason: string | null;
}

/** How the text and image verdicts were reconciled. */
export type FusionVerdict =
  | "text-only"
  | "agree"
  | "image-worse"
  | "text-worse"
  | "image-unusable"
  | "image-resolved-vagueness";

export interface Fusion {
  verdict: FusionVerdict;
  textDanger: number;
  imageDanger: number | null;
  /** Plain-language explanation shown in the admin UI. */
  note: string;
}

/**
 * What gets written to the `assessments` table.
 *
 * Only text/image-derived findings live here. Wait time and the final score are
 * deliberately NOT stored - they change every day, and a persisted copy would
 * be wrong by morning. See `scoreRequest()`.
 */
export interface Classification {
  hazards: DetectedHazard[];
  /** Fused danger score: what the weighting actually consumes. */
  dangerScore: number;
  reviewStatus: ReviewStatus;
  reviewNote: string;
  /** Null when no photo was supplied or vision was unavailable. */
  imageFindings: ImageFindings | null;
  /** How text and image were reconciled. */
  fusion: Fusion;
  /** Bumped when rules change, so stale rows can be re-classified. */
  engineVersion: string;
  /** Which analyzer produced this. Image fusion arrives in a later phase. */
  source: "text" | "image" | "fused";
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Scoring (the cheap half - recomputed on every read)
// ---------------------------------------------------------------------------

export type PriorityLevel = "Critical" | "High" | "Medium" | "Low";

export interface ScoreBreakdown {
  danger: number;
  wait: number;
  location: number;
  review: number;
}

export interface Assessment {
  finalScore: number;
  weightedScore: number;
  priority: PriorityLevel;
  breakdown: ScoreBreakdown;
  hazards: DetectedHazard[];
  escalated: boolean;
  escalationReason: string | null;
  reviewStatus: ReviewStatus;
  reviewNote: string;
  reasoning: string;
  /** Carried through so the admin UI can show how the photo affected the score. */
  imageFindings: ImageFindings | null;
  fusion: Fusion;
}

/** A request joined with its live assessment - what the admin UI renders. */
export type ScoredRequest = TreeRequest & {
  daysWaiting: number;
  assessment: Assessment;
  imageCount: number;
  duplicateCount: number;
};

// ---------------------------------------------------------------------------
// Same-day work planning
// ---------------------------------------------------------------------------

// These shapes are produced by the backend planner and rendered by the
// frontend, so they are part of the shared contract rather than engine
// internals. The algorithm that fills them stays in backend/domain/bundling.ts.

export interface BundleCandidate {
  request: ScoredRequest;
  distanceMeters: number;
  travelMinutes: number;
  /** Crew hours for the job itself, excluding travel. */
  jobHours: number;
  /** Job hours plus travel overhead - what the shift actually pays. */
  totalHours: number;
  /** Final score per hour consumed, discounted by how far off-route it is. */
  areaValue: number;
  /** True when this fits inside the hours left after the anchor. */
  fitsToday: boolean;
  reason: string;
}

export interface BundlePlan {
  anchor: ScoredRequest;
  shiftHours: number;
  anchorHours: number;
  /** Shift hours left after the anchor job. */
  remainingHours: number;
  /** Best work in the area, whether or not it fits today. 3-5 entries. */
  recommended: BundleCandidate[];
  /** The subset that fits, in the order the crew should drive it. */
  selected: BundleCandidate[];
  /** Recommended work that does not fit today - the follow-up trip. */
  followUp: BundleCandidate[];
  /** Hours consumed by the scheduled jobs (job + travel). */
  bundledHours: number;
  /** Hours still unused after the anchor and the bundle. */
  slackHours: number;
  /** Open requests considered before the distance filter. */
  consideredCount: number;
  /** Why no plan could be produced, when `selected` is empty. */
  note: string | null;
}

