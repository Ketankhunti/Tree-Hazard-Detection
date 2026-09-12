import { X } from "lucide-react";
import type { Priority, ReviewStatus } from "../types";

export interface FilterState {
  neighborhood: string;
  priority: Priority | "All";
  review: ReviewStatus | "All";
}

interface FilterBarProps {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  neighborhoods: string[];
  resultCount: number;
}

export function FilterBar({ filters, setFilters, neighborhoods, resultCount }: FilterBarProps) {
  const hasActiveFilters =
    filters.neighborhood !== "All" || filters.priority !== "All" || filters.review !== "All";

  return (
    <div className="flex flex-wrap items-end gap-4 border border-gray-200 bg-white p-4 rounded-lg">
      {/* Neighborhood */}
      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
          Neighborhood
        </label>
        <select
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={filters.neighborhood}
          onChange={(e) => setFilters({ ...filters, neighborhood: e.target.value })}
        >
          <option value="All">All</option>
          {neighborhoods.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {/* Priority */}
      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
          Priority
        </label>
        <select
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={filters.priority}
          onChange={(e) => setFilters({ ...filters, priority: e.target.value as Priority | "All" })}
        >
          <option value="All">All</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      {/* Review Status */}
      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
          Review Status
        </label>
        <select
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={filters.review}
          onChange={(e) => setFilters({ ...filters, review: e.target.value as ReviewStatus | "All" })}
        >
          <option value="All">All</option>
          <option value="Unsure">Unsure</option>
          <option value="Reviewed">Reviewed</option>
        </select>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          onClick={() => setFilters({ neighborhood: "All", priority: "All", review: "All" })}
        >
          <X size={14} strokeWidth={2} />
          Clear Filters
        </button>
      )}

      {/* Result count */}
      <div className="ml-auto text-sm text-gray-500">
        Showing <span className="font-semibold text-gray-900">{resultCount}</span> of 20 complaints
      </div>
    </div>
  );
}
