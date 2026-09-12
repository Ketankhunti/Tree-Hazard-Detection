import Link from "next/link";
import { CalendarClock, Info, Route, TriangleAlert } from "lucide-react";

import { BundleMap } from "./BundleMap";
import { PriorityBadge } from "./PriorityBadge";
import { formatDistance } from "@/shared/geo";
import type { StaticMapImage } from "@/shared/map";
import type { BundlePlan } from "@/shared/types";
import type { ScoredRequest } from "@/shared/types";

function hours(value: number): string {
  return `${value.toFixed(1)} h`;
}

/**
 * The crew's day around one anchor job.
 *
 * Shows the reasoning, not just the answer: every recommendation carries its
 * distance, its hours and its rank in the main queue, so it is obvious why a
 * job ranked #14 is being suggested ahead of the one ranked #2.
 */
export function DayPlan({
  plan,
  others,
  ranks,
  basemap,
}: {
  plan: BundlePlan;
  others: ScoredRequest[];
  /** Request id -> position in the main queue. Plain data so it can cross
   *  the server/client boundary. */
  ranks: Record<string, number>;
  /** Signed Google basemap for the map; null when unconfigured. */
  basemap: StaticMapImage | null;
}) {
  const bundled = plan.selected.map((candidate) => candidate.request);
  const followUpRequests = plan.followUp.map((candidate) => candidate.request);
  const totalDay = plan.anchorHours + plan.bundledHours;

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-900">
            <Route className="h-4 w-4 text-slate-400" aria-hidden />
            Same-Day Work Plan
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Other open work close enough to clear on the same trip.
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="label-caps">Shift used</p>
            <p className="font-mono text-lg font-bold tabular-nums text-slate-900">
              {hours(totalDay)}
              <span className="text-sm font-normal text-slate-400">
                {" "}
                / {hours(plan.shiftHours)}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Shift budget bar */}
      <div className="mt-4">
        <div className="flex h-6 w-full overflow-hidden border border-slate-300 bg-slate-100">
          <div
            className="flex items-center justify-center bg-slate-900 text-[10px] font-bold text-white"
            style={{ width: `${(plan.anchorHours / plan.shiftHours) * 100}%` }}
            title={`Anchor job: ${hours(plan.anchorHours)}`}
          >
            {plan.anchorHours >= 1.5 ? "ANCHOR" : ""}
          </div>
          {plan.selected.map((candidate, index) => (
            <div
              key={candidate.request.id}
              className="flex items-center justify-center border-l border-white/40 bg-amber-400 text-[10px] font-bold text-amber-950"
              style={{
                width: `${(candidate.totalHours / plan.shiftHours) * 100}%`,
              }}
              title={`${candidate.request.address}: ${hours(candidate.totalHours)} including travel`}
            >
              {candidate.totalHours >= 1.5 ? index + 1 : ""}
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
          <span>
            Anchor {hours(plan.anchorHours)} · bundled{" "}
            {hours(plan.bundledHours)} (job + travel)
          </span>
          <span>{hours(plan.slackHours)} unallocated</span>
        </div>
      </div>

      {plan.note && (
        <div className="mt-4 flex items-start gap-2.5 border-l-4 border-slate-400 bg-slate-50 px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <p className="text-sm text-slate-700">{plan.note}</p>
        </div>
      )}

      {plan.recommended.length > 0 && (
        <>
          <div className="mt-5">
            <BundleMap
              anchor={plan.anchor}
              bundled={bundled}
              followUp={followUpRequests}
              others={others}
              basemap={basemap}
            />
          </div>

          {plan.selected.length > 0 && (
            <p className="label-caps mt-4">
              Scheduled today — {hours(plan.bundledHours)} of the remaining{" "}
              {hours(plan.remainingHours)}
            </p>
          )}

          <ol className="mt-2 divide-y divide-slate-200 border border-slate-200">
            {plan.selected.map((candidate, index) => {
              const rank = ranks[candidate.request.id] ?? null;
              return (
                <li key={candidate.request.id}>
                  <Link
                    href={`/admin/requests/${candidate.request.id}`}
                    className="flex flex-wrap items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-amber-400 font-mono text-xs font-bold text-amber-950">
                      {index + 1}
                    </span>
                    <span className="min-w-[180px] flex-1">
                      <span className="block text-sm font-semibold text-slate-900">
                        {candidate.request.address}
                      </span>
                      <span className="text-xs text-slate-500">
                        {candidate.request.neighborhood} ·{" "}
                        <span className="font-mono">
                          {candidate.request.reference}
                        </span>
                      </span>
                    </span>
                    <span className="text-xs text-slate-600">
                      <span className="font-mono font-semibold text-slate-900">
                        {formatDistance(candidate.distanceMeters)}
                      </span>{" "}
                      away
                    </span>
                    <span className="text-xs text-slate-600">
                      <span className="font-mono font-semibold text-slate-900">
                        {hours(candidate.jobHours)}
                      </span>{" "}
                      on site
                    </span>
                    <span className="text-xs text-slate-500">
                      +{Math.round(candidate.travelMinutes)} min travel
                    </span>
                    <PriorityBadge priority={candidate.request.assessment.priority} />
                    {rank !== null && (
                      <span className="font-mono text-[11px] text-slate-400">
                        queue #{String(rank).padStart(2, "0")}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>

          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Ranked by severity earned per hour of shift consumed, then ordered
              by driving distance. This is why the suggestions are not simply the
              next entries in the priority queue — a nearby Medium job can be
              worth more of a remaining afternoon than a High job across town.
            </span>
          </p>
        </>
      )}

      {plan.followUp.length > 0 && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="label-caps flex items-center gap-1.5">
            <TriangleAlert className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            Also in this area — does not fit today
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Worth a follow-up trip while the crew is mobilized nearby, or a
            reshuffle if the anchor job finishes early.
          </p>
          <ul className="mt-2 divide-y divide-slate-200 border border-slate-200">
            {plan.followUp.map((candidate) => (
              <li key={candidate.request.id}>
                <Link
                  href={`/admin/requests/${candidate.request.id}`}
                  className="flex flex-wrap items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-50"
                >
                  <span className="min-w-[180px] flex-1 text-sm font-medium text-slate-800">
                    {candidate.request.address}
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-900">
                    {formatDistance(candidate.distanceMeters)}
                  </span>
                  <span className="text-xs text-slate-600">
                    needs {hours(candidate.totalHours)}
                  </span>
                  <PriorityBadge priority={candidate.request.assessment.priority} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
