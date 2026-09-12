import { notFound } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { RequestDetail } from "@/components/RequestDetail";
import {
  getDuplicatesOf,
  getFeedback,
  getImages,
  getRequest,
  getStatusHistory,
} from "@/lib/repository";

export const dynamic = "force-dynamic";

export default function RequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const request = getRequest(params.id);
  if (!request) notFound();

  return (
    <div className="min-h-screen bg-white">
      <AppHeader />
      <RequestDetail
        request={request}
        images={getImages(request.id)}
        history={getStatusHistory(request.id)}
        duplicates={getDuplicatesOf(request.id)}
        feedback={getFeedback(request.id)}
      />
    </div>
  );
}
