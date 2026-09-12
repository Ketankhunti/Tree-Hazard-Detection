"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";

import { changeStatus, markCompleted, reopenRequest } from "@/app/admin/actions";
import { CLOSED_STATUSES, type RequestStatus } from "@/shared/types";

/**
 * Status control for a single request.
 *
 * "Mark complete" is a dedicated button rather than one option in the dropdown:
 * it is the action a crew performs many times a day, and burying it in a select
 * makes the common path the slowest one.
 */

const WORKFLOW: RequestStatus[] = [
  "Submitted",
  "Triaged",
  "Scheduled",
  "In Progress",
];

export function StatusControl({
  requestId,
  status,
}: {
  requestId: string;
  status: RequestStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isClosed = (CLOSED_STATUSES as string[]).includes(status);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isClosed && (
        <>
          <label htmlFor="status-select" className="sr-only">
            Request status
          </label>
          <select
            id="status-select"
            value={status}
            disabled={pending}
            onChange={(event) =>
              run(() => changeStatus(requestId, event.target.value))
            }
            className="h-[38px] border border-slate-300 bg-white px-2 text-sm font-medium text-slate-900 disabled:opacity-50"
          >
            {WORKFLOW.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => markCompleted(requestId))}
            className="inline-flex h-[38px] items-center gap-2 border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            )}
            Mark complete
          </button>
        </>
      )}

      {isClosed && (
        <>
          <span className="inline-flex h-[38px] items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-900">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {status}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => reopenRequest(requestId))}
            className="inline-flex h-[38px] items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden />
            )}
            Reopen
          </button>
        </>
      )}

      {error && (
        <span role="alert" className="text-xs font-medium text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
