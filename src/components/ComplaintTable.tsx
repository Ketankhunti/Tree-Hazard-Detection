import { ArrowDown, ArrowUp, ChevronRight, SearchX } from "lucide-react";

import { PriorityBadge, ReviewBadge } from "./PriorityBadge";
import { ScoreBar } from "./ScoreBar";
import type { ScoredRequest } from "@/lib/types";

export type SortKey =
  | "finalScore"
  | "dangerScore"
  | "daysWaiting"
  | "address"
  | "neighborhood";

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { key: "finalScore", direction: "desc" };

/** Text columns read naturally A-Z first; numeric columns read highest-first. */
export function defaultDirectionFor(key: SortKey): SortDirection {
  return key === "address" || key === "neighborhood" ? "asc" : "desc";
}

export function sortComplaints(
  rows: ScoredRequest[],
  sort: SortState
): ScoredRequest[] {
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    switch (sort.key) {
      case "address":
        return a.address.localeCompare(b.address) * factor;
      case "neighborhood":
        return (
          a.neighborhood.localeCompare(b.neighborhood) * factor ||
          b.assessment.finalScore - a.assessment.finalScore
        );
      case "daysWaiting":
        return (
          (a.daysWaiting - b.daysWaiting) * factor ||
          b.assessment.finalScore - a.assessment.finalScore
        );
      case "dangerScore":
        return (
          (a.assessment.breakdown.danger - b.assessment.breakdown.danger) * factor ||
          b.assessment.finalScore - a.assessment.finalScore
        );
      case "finalScore":
      default:
        return (
          (a.assessment.finalScore - b.assessment.finalScore) * factor ||
          b.assessment.breakdown.danger - a.assessment.breakdown.danger
        );
    }
  });
}

const COLUMNS: Array<{
  key: SortKey | null;
  label: string;
  className: string;
  align?: "left" | "center";
}> = [
  { key: null, label: "Rank", className: "w-[62px]" },
  { key: "address", label: "Address", className: "w-[230px]" },
  { key: "neighborhood", label: "Neighborhood", className: "w-[150px]" },
  { key: "daysWaiting", label: "Days Waiting", className: "w-[104px]", align: "center" },
  { key: "dangerScore", label: "Danger Score", className: "w-[150px]" },
  { key: "finalScore", label: "Priority", className: "w-[130px]" },
  { key: null, label: "Review", className: "w-[92px]" },
  { key: null, label: "Status", className: "w-[150px]" },
];

function SortHeader({
  label,
  columnKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  columnKey: SortKey | null;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "center";
}) {
  if (!columnKey) {
    return <span className={align === "center" ? "block text-center" : ""}>{label}</span>;
  }

  const active = sort.key === columnKey;
  const Icon = sort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onSort(columnKey)}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={`group inline-flex items-center gap-1 hover:text-slate-900 ${
        active ? "text-slate-900" : ""
      } ${align === "center" ? "justify-center" : ""}`}
    >
      {label}
      <Icon
        className={`h-3 w-3 transition-opacity ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
        }`}
        aria-hidden
      />
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <SearchX className="h-8 w-8 text-slate-300" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-slate-700">
        No complaints match these filters
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Clear one or more filters to widen the queue.
      </p>
    </div>
  );
}

export function ComplaintTable({
  rows,
  sort,
  onSort,
  onSelect,
}: {
  rows: ScoredRequest[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  onSelect: (complaint: ScoredRequest) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="panel">
        <EmptyState />
      </div>
    );
  }

  return (
    <>
      {/* Desktop / tablet: dense table, horizontally scrollable when narrow. */}
      <div className="panel hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1060px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 bg-slate-50">
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className={`label-caps px-3 py-2.5 text-left font-semibold ${column.className}`}
                >
                  <SortHeader
                    label={column.label}
                    columnKey={column.key}
                    sort={sort}
                    onSort={onSort}
                    align={column.align}
                  />
                </th>
              ))}
              <th scope="col" className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                tabIndex={0}
                role="button"
                onClick={() => onSelect(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
                className="cursor-pointer border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50 focus-visible:bg-slate-50"
              >
                <td className="px-3 py-2.5">
                  <span className="font-mono text-sm font-semibold tabular-nums text-slate-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="block font-medium text-slate-900">{row.address}</span>
                  <span className="font-mono text-[11px] text-slate-400">{row.reference}</span>
                </td>
                <td className="px-3 py-2.5 text-slate-600">{row.neighborhood}</td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      row.daysWaiting >= 180
                        ? "font-semibold text-red-700"
                        : "text-slate-700"
                    }`}
                  >
                    {row.daysWaiting}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <ScoreBar value={row.assessment.breakdown.danger} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={row.assessment.priority} />
                    <span className="font-mono text-xs font-semibold tabular-nums text-slate-500">
                      {row.assessment.finalScore}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <ReviewBadge status={row.assessment.reviewStatus} />
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-600">{row.status}</td>
                <td className="px-2 py-2.5">
                  <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: the same rows as stacked cards. */}
      <div className="space-y-2 md:hidden">
        {rows.map((row, index) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect(row)}
            className="panel block w-full p-3 text-left transition-colors hover:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-xs font-semibold text-slate-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="truncate font-medium text-slate-900">{row.address}</p>
                <p className="text-xs text-slate-500">{row.neighborhood}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <PriorityBadge priority={row.assessment.priority} />
                {row.assessment.reviewStatus === "Unsure" && (
                  <ReviewBadge status="Unsure" />
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
              <div>
                <p className="label-caps mb-1">Danger</p>
                <ScoreBar value={row.assessment.breakdown.danger} />
              </div>
              <div className="text-right">
                <p className="label-caps">Waiting</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-slate-800">
                  {row.daysWaiting}d
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
