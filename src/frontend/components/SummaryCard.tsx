import type { LucideIcon } from "lucide-react";

export function SummaryCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  accent = "text-slate-900",
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint: string;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="label-caps">{label}</p>
        <Icon className={`h-4 w-4 shrink-0 ${accent}`} aria-hidden />
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className={`font-mono text-4xl font-bold tabular-nums leading-none ${accent}`}>
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-slate-500">{unit}</span>}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}
