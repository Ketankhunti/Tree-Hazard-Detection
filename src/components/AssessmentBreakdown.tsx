import { ScoreBar } from "./ScoreBar";
import { WEIGHTS } from "@/engine/scoring";
import type { Assessment } from "@/lib/types";

const ROWS: Array<{ key: keyof Assessment["breakdown"]; label: string; weight: number }> = [
  { key: "danger", label: "Danger", weight: WEIGHTS.danger },
  { key: "wait", label: "Wait Time", weight: WEIGHTS.wait },
  { key: "location", label: "Location Impact", weight: WEIGHTS.location },
  { key: "review", label: "Human Review", weight: WEIGHTS.review },
];

export function AssessmentBreakdown({ assessment }: { assessment: Assessment }) {
  return (
    <div>
      <div className="space-y-3">
        {ROWS.map((row) => {
          const score = assessment.breakdown[row.key];
          return (
            <div key={row.key} className="grid grid-cols-[130px_1fr_86px] items-center gap-3">
              <span className="text-sm font-medium text-slate-700">{row.label}</span>
              <ScoreBar
                value={score}
                tone={row.key === "danger" ? "danger" : "neutral"}
                showValue={false}
              />
              <span className="text-right font-mono text-xs tabular-nums text-slate-600">
                <span className="font-semibold text-slate-900">{score}</span>
                <span className="text-slate-400"> / 100</span>
                <span className="ml-1.5 text-slate-400">×{row.weight}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-900">
            Weighted Score
          </span>
          <span className="font-mono text-lg font-bold tabular-nums text-slate-900">
            {assessment.weightedScore}
          </span>
        </div>

        {assessment.escalated && (
          <div className="mt-3 border-l-2 border-red-600 bg-red-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
              Imminent-hazard escalation applied
            </p>
            <p className="mt-1 text-xs leading-relaxed text-red-900">
              {assessment.escalationReason}
            </p>
          </div>
        )}

        <div className="mt-3 flex items-baseline justify-between border-t border-slate-900 pt-3">
          <span className="text-sm font-bold uppercase tracking-wide text-slate-900">
            Final Priority Score
          </span>
          <span className="font-mono text-3xl font-bold tabular-nums text-slate-900">
            {assessment.finalScore}
          </span>
        </div>
      </div>
    </div>
  );
}
