import type { ScoreBreakdown } from "../types";
import { ScoreBar } from "./ScoreBar";

export function AssessmentBreakdown({ scores }: { scores: ScoreBreakdown }) {
  return (
    <div className="space-y-3">
      <ScoreBar label="Text Danger" value={scores.textDangerScore} color="bg-orange-500" />
      <ScoreBar label="Image Danger" value={scores.imageDangerScore} color="bg-red-500" />
      <ScoreBar label="Combined Danger" value={scores.dangerScore} color="bg-rose-600" />
      <ScoreBar label="Wait Time" value={scores.waitScore} color="bg-blue-500" />
      <ScoreBar label="Location Impact" value={scores.locationScore} color="bg-amber-500" />
      <ScoreBar label="Human Review" value={scores.reviewScore} color="bg-purple-500" />
      <div className="border-t border-gray-200 pt-3">
        <ScoreBar label="Final Priority Score" value={scores.finalScore} color="bg-gray-800" />
      </div>
    </div>
  );
}
