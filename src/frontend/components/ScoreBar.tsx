/** Horizontal 0-100 meter. Color tracks severity so the queue scans quickly. */
export function ScoreBar({
  value,
  tone = "danger",
  showValue = true,
  className = "",
}: {
  value: number;
  tone?: "danger" | "neutral";
  showValue?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const fill =
    tone === "neutral"
      ? "bg-slate-500"
      : clamped >= 70
        ? "bg-red-600"
        : clamped >= 45
          ? "bg-orange-500"
          : clamped >= 20
            ? "bg-amber-400"
            : "bg-slate-400";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="h-2 w-full min-w-[48px] overflow-hidden bg-slate-200"
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full ${fill}`} style={{ width: `${clamped}%` }} />
      </div>
      {showValue && (
        <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-slate-700">
          {clamped}
        </span>
      )}
    </div>
  );
}
