interface ScoreBarProps {
  label: string;
  value: number;
  max?: number;
  color?: string;
}

export function ScoreBar({ label, value, max = 100, color = "bg-blue-600" }: ScoreBarProps) {
  const percentage = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900">
          {Math.round(value)} / {max}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
        <div
          className={`h-full rounded ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
