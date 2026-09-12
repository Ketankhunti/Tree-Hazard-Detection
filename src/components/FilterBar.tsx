import { X } from "lucide-react";

import type { PriorityLevel, ReviewStatus } from "@/lib/types";

export type PriorityFilter = "All" | PriorityLevel;
export type ReviewFilter = "All" | ReviewStatus;

export interface Filters {
  neighborhood: string;
  priority: PriorityFilter;
  review: ReviewFilter;
}

export const DEFAULT_FILTERS: Filters = {
  neighborhood: "All",
  priority: "All",
  review: "All",
};

const PRIORITY_OPTIONS: PriorityFilter[] = ["All", "Critical", "High", "Medium", "Low"];
const REVIEW_OPTIONS: ReviewFilter[] = ["All", "Unsure", "Reviewed"];

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div>
      <p className="label-caps mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-px border border-slate-300 bg-slate-300">
        {options.map((option) => {
          const active = option === value;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={active}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FilterBar({
  filters,
  neighborhoods,
  onChange,
  onClear,
  visibleCount,
  totalCount,
}: {
  filters: Filters;
  neighborhoods: string[];
  onChange: (next: Filters) => void;
  onClear: () => void;
  visibleCount: number;
  totalCount: number;
}) {
  const isFiltered =
    filters.neighborhood !== "All" ||
    filters.priority !== "All" ||
    filters.review !== "All";

  return (
    <section className="panel-muted p-4" aria-label="Queue filters">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div>
          <label className="label-caps mb-1.5 block" htmlFor="neighborhood-filter">
            Neighborhood
          </label>
          <select
            id="neighborhood-filter"
            value={filters.neighborhood}
            onChange={(event) =>
              onChange({ ...filters, neighborhood: event.target.value })
            }
            className="h-[34px] min-w-[190px] border border-slate-300 bg-white px-2 text-sm text-slate-900"
          >
            <option value="All">All neighborhoods</option>
            {neighborhoods.map((neighborhood) => (
              <option key={neighborhood} value={neighborhood}>
                {neighborhood}
              </option>
            ))}
          </select>
        </div>

        <SegmentedControl
          label="Priority"
          options={PRIORITY_OPTIONS}
          value={filters.priority}
          onChange={(priority) => onChange({ ...filters, priority })}
        />

        <SegmentedControl
          label="Review Status"
          options={REVIEW_OPTIONS}
          value={filters.review}
          onChange={(review) => onChange({ ...filters, review })}
        />

        <div className="ml-auto flex items-center gap-4">
          <p className="text-sm text-slate-600">
            Showing{" "}
            <span className="font-mono font-semibold tabular-nums text-slate-900">
              {visibleCount}
            </span>
            <span className="text-slate-400"> / {totalCount}</span>
          </p>
          <button
            type="button"
            onClick={onClear}
            disabled={!isFiltered}
            className="inline-flex h-[34px] items-center gap-1.5 border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear Filters
          </button>
        </div>
      </div>
    </section>
  );
}
