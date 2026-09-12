import { notFound } from "next/navigation";

import { AppHeader } from "@/frontend/components/AppHeader";
import { RequestDetail } from "@/frontend/components/RequestDetail";
import {
  getDuplicatesOf,
  getFeedback,
  getImages,
  getRequest,
  getStatusHistory,
  listOpenRequests,
} from "@/backend/db/repository";
import { buildBundlePlan } from "@/backend/domain/bundling";
import { OPEN_STATUSES } from "@/shared/types";

export const dynamic = "force-dynamic";

export default function RequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const request = getRequest(params.id);
  if (!request) notFound();

  // The queue is needed both to find bundling candidates and to show where each
  // recommendation sits in the main ranking.
  const openQueue = listOpenRequests();
  const rankById = new Map(openQueue.map((item, index) => [item.id, index + 1]));

  // A closed request has no day plan - there is nothing left to schedule.
  const plan = (OPEN_STATUSES as string[]).includes(request.status)
    ? buildBundlePlan(request, openQueue)
    : null;

  const bundledIds = new Set(plan?.selected.map((c) => c.request.id) ?? []);
  const otherOpen = openQueue.filter(
    (item) => item.id !== request.id && !bundledIds.has(item.id)
  );

  return (
    <div className="min-h-screen bg-white">
      <AppHeader />
      <RequestDetail
        request={request}
        images={getImages(request.id)}
        history={getStatusHistory(request.id)}
        duplicates={getDuplicatesOf(request.id)}
        feedback={getFeedback(request.id)}
        plan={plan}
        otherOpen={otherOpen}
        queueRank={rankById.get(request.id) ?? null}
        ranks={Object.fromEntries(rankById)}
      />
    </div>
  );
}
