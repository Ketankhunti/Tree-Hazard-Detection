"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, Clock, HelpCircle, ListTree } from "lucide-react";

import {
  ComplaintTable,
  DEFAULT_SORT,
  defaultDirectionFor,
  sortComplaints,
  type SortKey,
  type SortState,
} from "./ComplaintTable";
import { DEFAULT_FILTERS, FilterBar, type Filters } from "./FilterBar";
import { SummaryCard } from "./SummaryCard";
import type { ScoredRequest } from "@/shared/types";

/**
 * Client half of the admin queue. Rows arrive already scored and ranked from
 * the server; this component only filters, sorts and navigates.
 */
export function QueueView({
  requests,
  closedCount,
}: {
  requests: ScoredRequest[];
  closedCount: number;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const neighborhoods = useMemo(
    () => [...new Set(requests.map((r) => r.neighborhood))].sort(),
    [requests]
  );

  // Summary statistics describe the whole open queue, not the filtered view.
  const stats = useMemo(() => {
    const urgent = requests.filter(
      (r) => r.assessment.priority === "Critical" || r.assessment.priority === "High"
    ).length;
    const unsure = requests.filter(
      (r) => r.assessment.reviewStatus === "Unsure"
    ).length;
    const averageWait = requests.length
      ? Math.round(
          requests.reduce((sum, r) => sum + r.daysWaiting, 0) / requests.length
        )
      : 0;
    const longestWait = requests.length
      ? Math.max(...requests.map((r) => r.daysWaiting))
      : 0;
    return { urgent, unsure, averageWait, longestWait };
  }, [requests]);

  const visible = useMemo(() => {
    const filtered = requests.filter((request) => {
      if (
        filters.neighborhood !== "All" &&
        request.neighborhood !== filters.neighborhood
      ) {
        return false;
      }
      if (
        filters.priority !== "All" &&
        request.assessment.priority !== filters.priority
      ) {
        return false;
      }
      if (
        filters.review !== "All" &&
        request.assessment.reviewStatus !== filters.review
      ) {
        return false;
      }
      return true;
    });
    return sortComplaints(filtered, sort);
  }, [requests, filters, sort]);

  /** Clicking the active column flips direction; a new column starts natural. */
  function handleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: defaultDirectionFor(key) }
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <section
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Queue summary"
      >
        <SummaryCard
          label="Open Requests"
          value={requests.length}
          icon={ListTree}
          hint={`${closedCount} closed and out of the queue`}
        />
        <SummaryCard
          label="Critical / High Danger"
          value={stats.urgent}
          icon={AlertOctagon}
          accent="text-red-600"
          hint="Scored at or above 60 — inspect first"
        />
        <SummaryCard
          label="Needs Human Review"
          value={stats.unsure}
          icon={HelpCircle}
          accent="text-purple-700"
          hint="Description too vague to triage automatically"
        />
        <SummaryCard
          label="Average Wait Time"
          value={stats.averageWait}
          unit="days"
          icon={Clock}
          accent="text-slate-700"
          hint={`Longest outstanding request: ${stats.longestWait} days`}
        />
      </section>

      <div className="mt-6">
        <FilterBar
          filters={filters}
          neighborhoods={neighborhoods}
          onChange={setFilters}
          onClear={() => setFilters(DEFAULT_FILTERS)}
          visibleCount={visible.length}
          totalCount={requests.length}
        />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">
            Inspection Queue
          </h2>
          <p className="text-xs text-slate-500">
            Select a row to open the full hazard assessment
          </p>
        </div>
        <ComplaintTable
          rows={visible}
          sort={sort}
          onSort={handleSort}
          onSelect={(request) => router.push(`/admin/requests/${request.id}`)}
        />
      </div>
    </div>
  );
}
