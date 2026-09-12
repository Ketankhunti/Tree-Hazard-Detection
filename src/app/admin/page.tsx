import { AppHeader } from "@/frontend/components/AppHeader";
import { QueueView } from "@/frontend/components/QueueView";
import { listClosedRequests, listOpenRequests } from "@/backend/db/repository";

// Scores depend on "now", so this page must never be statically cached.
export const dynamic = "force-dynamic";

export default async function AdminQueuePage() {
  const [requests, closed] = await Promise.all([
    listOpenRequests(),
    listClosedRequests(),
  ]);

  return (
    <div className="min-h-screen bg-white">
      <AppHeader status={`${requests.length} open requests`} />
      <QueueView requests={requests} closedCount={closed.length} />
      <footer className="no-print border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6">
          <p className="text-xs leading-relaxed text-slate-500">
            This tool ranks the order in which requests should receive a site visit.
            It does not determine whether a tree is dangerous. Every assessment
            requires confirmation by a qualified arborist.
          </p>
        </div>
      </footer>
    </div>
  );
}
