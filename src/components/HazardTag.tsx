import { AlertTriangle } from "lucide-react";

export function HazardTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
      <AlertTriangle size={12} strokeWidth={2} />
      {label}
    </span>
  );
}
