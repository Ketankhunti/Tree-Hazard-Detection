import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Copy, Mail, TreePine } from "lucide-react";

import { getRequest } from "@/lib/repository";

export const dynamic = "force-dynamic";

/**
 * Resident-facing confirmation.
 *
 * Deliberately shows no risk score. The triage ranking is an internal
 * dispatch decision, and telling a resident their tree scored "Low" reads as
 * a safety judgement the tool is not making.
 */
export default function ReportConfirmationPage({
  params,
}: {
  params: { reference: string };
}) {
  const request = getRequest(decodeURIComponent(params.reference));
  if (!request) notFound();

  const isDuplicate = request.status === "Duplicate";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-9 w-9 items-center justify-center bg-slate-900">
            <TreePine className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div>
            <p className="text-base font-bold leading-tight text-slate-900">
              Halifax Regional Municipality
            </p>
            <p className="text-xs leading-tight text-slate-500">
              Urban Forestry &middot; Report a tree
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="border border-slate-200 bg-white p-6 sm:p-8">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
            Thank you — your report has been received
          </h1>

          <div className="mt-5 border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Your reference number
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-tight text-slate-900">
              {request.reference}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Quote this if you contact 311 about this tree.
            </p>
          </div>

          {isDuplicate && (
            <div className="mt-4 flex items-start gap-3 border-l-4 border-slate-400 bg-slate-50 px-4 py-3">
              <Copy className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <p className="text-sm text-slate-700">
                Someone has already reported this tree, so we have added your
                report to the existing case rather than starting a new one. It
                is already in the queue.
              </p>
            </div>
          )}

          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Location
              </dt>
              <dd className="mt-1 text-sm text-slate-900">{request.address}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Received
              </dt>
              <dd className="mt-1 text-sm text-slate-900">
                {request.submittedAt.slice(0, 10)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                What you told us
              </dt>
              <dd className="mt-1 border-l-2 border-slate-200 pl-3 text-sm leading-relaxed text-slate-700">
                {request.description}
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex items-start gap-3 border-t border-slate-200 pt-5">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <p className="text-sm leading-relaxed text-slate-600">
              We will email{" "}
              <span className="font-mono text-slate-900">
                {request.reporterEmail}
              </span>{" "}
              when the work has been completed.
            </p>
          </div>

          <p className="mt-6 border-t border-slate-200 pt-5 text-xs leading-relaxed text-slate-500">
            Reports are assessed to decide the order of inspection. This is not a
            safety determination — only a qualified arborist on site can make
            that call. If the tree becomes an immediate danger, call 311, or 911
            in an emergency.
          </p>
        </div>

        <p className="mt-6 text-sm">
          <Link href="/report" className="font-semibold text-slate-700 underline">
            Report another tree
          </Link>
        </p>
      </main>
    </div>
  );
}
