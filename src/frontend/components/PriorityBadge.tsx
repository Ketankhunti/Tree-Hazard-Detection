import type { PriorityLevel, ReviewStatus } from "@/shared/types";

const PRIORITY_CLASSES: Record<PriorityLevel, string> = {
  Critical: "bg-red-600 text-white border-red-700",
  High: "bg-orange-500 text-white border-orange-600",
  Medium: "bg-amber-300 text-amber-950 border-amber-400",
  Low: "bg-slate-200 text-slate-700 border-slate-300",
};

export function PriorityBadge({
  priority,
  size = "sm",
}: {
  priority: PriorityLevel;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={`inline-flex items-center justify-center border font-semibold uppercase tracking-wide ${
        PRIORITY_CLASSES[priority]
      } ${size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]"}`}
    >
      {priority}
    </span>
  );
}

export function ReviewBadge({
  status,
  size = "sm",
}: {
  status: ReviewStatus;
  size?: "sm" | "lg";
}) {
  if (status === "Reviewed") {
    return (
      <span
        className={`inline-flex items-center justify-center border border-slate-200 bg-white font-medium text-slate-500 ${
          size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]"
        }`}
      >
        Reviewed
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center border border-purple-300 bg-purple-100 font-semibold uppercase tracking-wide text-purple-800 ${
        size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      Unsure
    </span>
  );
}
