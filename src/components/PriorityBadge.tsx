import type { Priority, ReviewStatus } from "../types";

const PRIORITY_STYLES: Record<Priority, string> = {
  Critical: "bg-red-600 text-white",
  High: "bg-orange-500 text-white",
  Medium: "bg-yellow-400 text-black",
  Low: "bg-gray-400 text-white",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[priority]}`}
    >
      {priority}
    </span>
  );
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  if (status === "Reviewed") return null;
  return (
    <span className="inline-flex items-center rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-300">
      Needs Review
    </span>
  );
}
