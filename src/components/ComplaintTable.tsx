import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { ScoredComplaint } from "../types";
import { PriorityBadge, ReviewBadge } from "./PriorityBadge";

type SortKey = "finalScore" | "dangerScore" | "daysWaiting" | "address" | "neighborhood";

interface ComplaintTableProps {
  complaints: ScoredComplaint[];
  onRowClick: (id: string) => void;
}

function SortIcon({
  col,
  sortKey,
  sortDir,
}: {
  col: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
}) {
  if (col !== sortKey) return <span className="inline-block w-3" />;
  return sortDir === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />;
}

function dangerBarColor(score: number): string {
  if (score >= 70) return "bg-red-500";
  if (score >= 40) return "bg-orange-400";
  if (score >= 20) return "bg-yellow-400";
  return "bg-gray-300";
}

export function ComplaintTable({ complaints, onRowClick }: ComplaintTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("finalScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...complaints].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "finalScore":
        cmp = a.scores.finalScore - b.scores.finalScore;
        break;
      case "dangerScore":
        cmp = a.scores.dangerScore - b.scores.dangerScore;
        break;
      case "daysWaiting":
        cmp = a.daysWaiting - b.daysWaiting;
        break;
      case "address":
        cmp = a.address.localeCompare(b.address);
        break;
      case "neighborhood":
        cmp = a.neighborhood.localeCompare(b.neighborhood);
        break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-3 py-3 text-center">Rank</th>
            <th
              className="cursor-pointer px-3 py-3 hover:text-gray-700"
              onClick={() => handleSort("address")}
            >
              <span className="inline-flex items-center gap-1">Address <SortIcon col="address" sortKey={sortKey} sortDir={sortDir} /></span>
            </th>
            <th
              className="cursor-pointer px-3 py-3 hover:text-gray-700"
              onClick={() => handleSort("neighborhood")}
            >
              <span className="inline-flex items-center gap-1">Neighborhood <SortIcon col="neighborhood" sortKey={sortKey} sortDir={sortDir} /></span>
            </th>
            <th
              className="cursor-pointer px-3 py-3 hover:text-gray-700"
              onClick={() => handleSort("daysWaiting")}
            >
              <span className="inline-flex items-center gap-1">Days Waiting <SortIcon col="daysWaiting" sortKey={sortKey} sortDir={sortDir} /></span>
            </th>
            <th
              className="cursor-pointer px-3 py-3 hover:text-gray-700"
              onClick={() => handleSort("dangerScore")}
            >
              <span className="inline-flex items-center gap-1">Danger Score <SortIcon col="dangerScore" sortKey={sortKey} sortDir={sortDir} /></span>
            </th>
            <th
              className="cursor-pointer px-3 py-3 hover:text-gray-700"
              onClick={() => handleSort("finalScore")}
            >
              <span className="inline-flex items-center gap-1">Priority <SortIcon col="finalScore" sortKey={sortKey} sortDir={sortDir} /></span>
            </th>
            <th className="px-3 py-3">Review</th>
            <th className="px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => (
            <tr
              key={c.id}
              className="cursor-pointer border-b border-gray-100 hover:bg-blue-50 transition-colors"
              onClick={() => onRowClick(c.id)}
            >
              <td className="px-3 py-3 text-center font-semibold text-gray-400">{i + 1}</td>
              <td className="px-3 py-3 font-medium text-gray-900">{c.address}</td>
              <td className="px-3 py-3 text-gray-600">{c.neighborhood}</td>
              <td className="px-3 py-3 text-gray-600">{c.daysWaiting}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-16 overflow-hidden rounded bg-gray-200">
                    <div
                      className={`h-full rounded ${dangerBarColor(c.scores.dangerScore)}`}
                      style={{ width: `${c.scores.dangerScore}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{c.scores.dangerScore}</span>
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={c.priority} />
                  <span className="text-xs font-bold text-gray-900">{c.scores.finalScore}</span>
                </div>
              </td>
              <td className="px-3 py-3"><ReviewBadge status={c.reviewStatus} /></td>
              <td className="px-3 py-3">
                <span className="text-xs text-gray-500">{c.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
