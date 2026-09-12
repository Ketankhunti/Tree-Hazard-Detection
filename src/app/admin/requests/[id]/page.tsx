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

export default async function RequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const request = await getRequest(params.id);
  if (!request) notFound();

  // The queue is needed both to find bundling candidates and to show where each
  // recommendation sits in the main ranking.
  const openQueue = await listOpenRequests();
  const rankById = new Map(openQueue.map((item, index) => [item.id, index + 1]));

  // A closed request has no day plan - there is nothing left to schedule.
  const plan = (OPEN_STATUSES as string[]).includes(request.status)
    ? buildBundlePlan(request, openQueue)
    : null;

  const [images, history, duplicates, feedback] = await Promise.all([
    getImages(request.id),
    getStatusHistory(request.id),
    getDuplicatesOf(request.id),
    getFeedback(request.id),
  ]);

  const bundledIds = new Set(plan?.selected.map((c) => c.request.id) ?? []);
  const otherOpen = openQueue.filter(
    (item) => item.id !== request.id && !bundledIds.has(item.id)
  );

  return (
    <div className="min-h-screen bg-white">
      <AppHeader />
      <RequestDetail
        request={request}
        images={images}
        history={history}
        duplicates={duplicates}
        feedback={feedback}
        plan={plan}
        otherOpen={otherOpen}
        queueRank={rankById.get(request.id) ?? null}
        ranks={Object.fromEntries(rankById)}
      />
    </div>
  );
}
