import { AlertTriangle } from "lucide-react";

import type { DetectedHazard } from "@/lib/types";

export function HazardTag({ hazard }: { hazard: DetectedHazard }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800"
      title={`Matched "${hazard.evidence}" (+${hazard.points})`}
    >
      <AlertTriangle className="h-3.5 w-3.5 text-orange-600" aria-hidden />
      {hazard.label}
      <span className="font-mono text-[11px] text-slate-500">+{hazard.points}</span>
    </span>
  );
}
