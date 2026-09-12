import type { LucideIcon } from "lucide-react";

interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  accentColor?: string;
}

export function SummaryCard({ title, value, icon: Icon, accentColor = "text-gray-700" }: SummaryCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className={`flex-shrink-0 ${accentColor}`}>
        <Icon size={28} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
