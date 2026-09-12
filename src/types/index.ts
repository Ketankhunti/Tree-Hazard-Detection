export type Priority = "Critical" | "High" | "Medium" | "Low";
export type ReviewStatus = "Unsure" | "Reviewed";
export type ComplaintStatus = "Pending" | "Inspected" | "In Progress";
export type DetectionSource = "text" | "image" | "system";

export interface TreeComplaint {
  id: string;
  address: string;
  street: string;
  neighborhood: string;
  complaintText: string;
  daysWaiting: number;
  submittedDate: string;
  status: ComplaintStatus;
  latitude: number;
  longitude: number;
  photoUrl?: string;
}

export interface Hazard {
  label: string;
  points: number;
  source: DetectionSource;
}

/** Result from analyzing a field photo */
export interface ImageDetectionResult {
  hazards: Hazard[];
  confidence: number; // 0-1
  summary: string;
  hasImage: boolean;
}

export interface ScoreBreakdown {
  textDangerScore: number;
  imageDangerScore: number;
  dangerScore: number; // combined
  waitScore: number;
  locationScore: number;
  reviewScore: number;
  finalScore: number;
}

export interface ScoredComplaint extends TreeComplaint {
  scores: ScoreBreakdown;
  hazards: Hazard[];
  imageDetection?: ImageDetectionResult;
  priority: Priority;
  reviewStatus: ReviewStatus;
  reasoning: string;
  textImageConflict: boolean;
}
