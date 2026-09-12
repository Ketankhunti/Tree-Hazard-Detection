import { config } from "@/backend/config";
import { distanceMeters, formatDistance } from "@/shared/geo";
import type {
  BundleCandidate,
  BundlePlan,
  ScoredRequest,
} from "@/shared/types";

/**
 * Same-day bundling.
 *
 * A crew is going to Quinpool Road today because it is the worst tree in the
 * city. That trip costs a mobilization whether they do one job or four. The
 * question this answers is: given they are already there and have hours left
 * in the shift, what else should they clear while they are in the area?
 *
 * WHY NOT JUST "THE FIVE NEAREST"
 * -------------------------------
 * Nearest-five is the obvious implementation and it is wrong. It will happily
 * return five cosmetic pruning jobs on the same block while a High-priority
 * tree sits 400 m away. The crew's remaining hours are the scarce resource, so
 * the objective has to weigh three things at once:
 *
 *   VALUE   how bad the tree is            (final score, 0-100)
 *   COST    how long the job takes         (estimated crew hours)
 *   COST    how long it takes to get there (travel time from the anchor)
 *
 * Ranking by value-per-hour handles all three: a Medium job next door can
 * legitimately beat a High job across town, and a six-hour Critical will not
 * be recommended into a two-hour gap. That is also why the recommendations are
 * deliberately NOT the next entries in the priority list.
 *
 * CAPACITY IS NOT THE SAME AS RELEVANCE
 * -------------------------------------
 * A Critical removal is genuinely most of a shift, so on a bad anchor only one
 * or two extra jobs actually fit. Returning a single suggestion would be
 * accurate and useless. So the plan reports two things:
 *
 *   recommended     the best work in the area, 3-5 of it, ranked
 *   scheduledToday  the prefix of that list which fits the remaining hours
 *
 * The rest is not discarded - it is the follow-up trip, already justified by
 * the crew being mobilized in that area. The dispatcher decides; the tool
 * shows the arithmetic.
 */

/**
 * Distance at which a candidate's value is halved. Tuned so a job on the next
 * block clearly beats an equivalent one across the neighbourhood.
 */
const PROXIMITY_HALF_LIFE_M = 400;

function travelMinutesFor(meters: number): number {
  const { travelSpeedKmh, setupMinutesPerSite } = config.crew;
  const driveMinutes = (meters / 1000 / travelSpeedKmh) * 60;
  return driveMinutes + setupMinutesPerSite;
}

function describe(candidate: {
  meters: number;
  jobHours: number;
  request: ScoredRequest;
}): string {
  const { request, meters, jobHours } = candidate;
  return `${formatDistance(meters)} from the anchor · ${request.assessment.priority} (${request.assessment.finalScore}) · ${jobHours} h on site`;
}

/**
 * Builds a day plan around `anchor`.
 *
 * Candidates must be open, independently ranked, geographically known, and
 * within the detour cap. Duplicates and closed work are already excluded by
 * `listOpenRequests`, but the anchor itself is filtered here.
 */
export function buildBundlePlan(
  anchor: ScoredRequest,
  openRequests: ScoredRequest[]
): BundlePlan {
  const { shiftHours, maxDetourMeters, maxRecommendations } = config.crew;
  const anchorHours = anchor.estimatedHours;
  const remainingHours = Math.max(shiftHours - anchorHours, 0);

  const empty = (note: string): BundlePlan => ({
    anchor,
    shiftHours,
    anchorHours,
    remainingHours,
    recommended: [],
    selected: [],
    followUp: [],
    bundledHours: 0,
    slackHours: remainingHours,
    consideredCount: openRequests.length,
    note,
  });

  if (anchor.latitude === null || anchor.longitude === null) {
    return empty(
      "This request has no coordinates on file, so nearby work cannot be identified. Add a map pin to enable bundling."
    );
  }

  if (remainingHours <= 0) {
    return empty(
      `This job alone is budgeted at ${anchorHours} h, which fills the ${shiftHours} h shift. No additional work should be scheduled for the same day.`
    );
  }

  // --- Score every reachable candidate -------------------------------------
  const candidates: BundleCandidate[] = [];
  let inRange = 0;

  for (const request of openRequests) {
    if (request.id === anchor.id) continue;

    const meters = distanceMeters(anchor, request);
    if (meters === null || meters > maxDetourMeters) continue;
    inRange += 1;

    const travelMinutes = travelMinutesFor(meters);
    const jobHours = request.estimatedHours;
    const totalHours = jobHours + travelMinutes / 60;

    // Severity earned per hour of shift consumed...
    const valuePerHour =
      request.assessment.finalScore / Math.max(totalHours, 0.25);
    // ...discounted by how far off-route it is. Travel minutes alone do not
    // capture this: 20 minutes of driving barely dents a 2-hour job, yet a
    // crew that leaves the area loses the whole reason for bundling.
    const proximityFactor = 1 / (1 + meters / PROXIMITY_HALF_LIFE_M);

    candidates.push({
      request,
      distanceMeters: meters,
      travelMinutes,
      jobHours,
      totalHours,
      areaValue: valuePerHour * proximityFactor,
      fitsToday: false,
      reason: describe({ meters, jobHours, request }),
    });
  }

  if (candidates.length === 0) {
    return empty(
      `No other open request sits within ${formatDistance(
        maxDetourMeters
      )} of this one. It cannot be combined with other work today.`
    );
  }

  // --- Rank the area, then fit what the shift allows ------------------------
  const recommended = [...candidates]
    .sort((a, b) => b.areaValue - a.areaValue)
    .slice(0, maxRecommendations);

  // Greedy fill in rank order. Skipping a job that does not fit and trying the
  // next one matters: one long job should not block two short ones behind it.
  let used = 0;
  for (const candidate of recommended) {
    if (used + candidate.totalHours <= remainingHours) {
      candidate.fitsToday = true;
      used += candidate.totalHours;
    }
  }

  const selected = recommended.filter((candidate) => candidate.fitsToday);
  const followUp = recommended.filter((candidate) => !candidate.fitsToday);

  // Work the closest first: the crew is driving, not reading a ranked list.
  const route = [...selected].sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    anchor,
    shiftHours,
    anchorHours,
    remainingHours,
    recommended,
    selected: route,
    followUp,
    bundledHours: used,
    slackHours: Math.max(remainingHours - used, 0),
    consideredCount: inRange,
    note:
      selected.length === 0
        ? `Nothing within ${formatDistance(
            maxDetourMeters
          )} fits the ${remainingHours.toFixed(
            1
          )} h left after this job, but the work below is close enough to justify a follow-up trip.`
        : null,
  };
}
