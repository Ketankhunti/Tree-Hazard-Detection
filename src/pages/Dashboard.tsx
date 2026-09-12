import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TreePine, AlertTriangle, Eye, Clock, Loader2 } from "lucide-react";
import { useComplaints } from "../hooks/useComplaints";
import { scoreAllComplaints } from "../lib/scoringEngine";
import { SummaryCard } from "../components/SummaryCard";
import { ComplaintTable } from "../components/ComplaintTable";
import { FilterBar, type FilterState } from "../components/FilterBar";

export function Dashboard() {
  const navigate = useNavigate();
  const { complaints, loading, source } = useComplaints();
  const [filters, setFilters] = useState<FilterState>({
    neighborhood: "All",
    priority: "All",
    review: "All",
  });

  const scored = useMemo(() => scoreAllComplaints(complaints), [complaints]);

  const neighborhoods = useMemo(
    () => [...new Set(complaints.map((t) => t.neighborhood))].sort(),
    [complaints]
  );

  const filtered = useMemo(() => {
    return scored.filter((c) => {
      if (filters.neighborhood !== "All" && c.neighborhood !== filters.neighborhood) return false;
      if (filters.priority !== "All" && c.priority !== filters.priority) return false;
      if (filters.review !== "All" && c.reviewStatus !== filters.review) return false;
      return true;
    });
  }, [scored, filters]);

  const stats = useMemo(() => {
    const criticalHigh = scored.filter(
      (c) => c.priority === "Critical" || c.priority === "High"
    ).length;
    const needsReview = scored.filter((c) => c.reviewStatus === "Unsure").length;
    const avgWait = scored.length > 0
      ? Math.round(scored.reduce((sum, c) => sum + c.daysWaiting, 0) / scored.length)
      : 0;
    return { total: scored.length, criticalHigh, needsReview, avgWait };
  }, [scored]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Halifax Urban Forestry</h1>
              <p className="text-sm text-gray-500">Tree Hazard Prioritization</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                className="inline-flex items-center gap-1.5 rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
                onClick={() => navigate("/report")}
              >
                <TreePine size={14} />
                Report a Hazard
              </button>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className={`inline-flex h-2 w-2 rounded-full ${source === "backend" ? "bg-green-500" : "bg-amber-500"}`} />
                {loading ? "Loading…" : `${stats.total} requests analyzed`}
                {source && !loading && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({source === "backend" ? "live HRM data" : "demo data"})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <p className="mt-4 text-sm text-gray-500">Fetching live HRM tree data…</p>
          </div>
        ) : (
          <>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard title="Total Requests" value={stats.total} icon={TreePine} accentColor="text-blue-600" />
          <SummaryCard title="Critical / High Danger" value={stats.criticalHigh} icon={AlertTriangle} accentColor="text-red-600" />
          <SummaryCard title="Needs Human Review" value={stats.needsReview} icon={Eye} accentColor="text-purple-600" />
          <SummaryCard title="Average Wait Time" value={`${stats.avgWait} days`} icon={Clock} accentColor="text-amber-600" />
        </div>

        {/* Filters */}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          neighborhoods={neighborhoods}
          resultCount={filtered.length}
        />

        {/* Table */}
        {filtered.length > 0 ? (
          <ComplaintTable complaints={filtered} onRowClick={(id) => navigate(`/complaint/${id}`)} />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <p className="text-gray-500">No complaints match the current filters.</p>
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}
