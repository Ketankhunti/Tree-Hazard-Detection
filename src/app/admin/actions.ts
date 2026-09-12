"use server";

import { revalidatePath } from "next/cache";

import { getRequest, getStatusHistory, setStatus } from "@/backend/db/repository";
import { OPEN_STATUSES, REQUEST_STATUSES, type RequestStatus } from "@/shared/types";

/**
 * Crew actions on a request.
 *
 * Until the admin console is gated (T12) there is no signed-in user, so every
 * change is attributed to a single operations actor. The `status_history` table
 * already records an actor per row, so adding real identities later is a
 * one-line change here rather than a schema migration.
 */
const ACTOR = "Urban Forestry Operations";

export type ActionResult = { ok: true } | { ok: false; error: string };

function isStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value);
}

function refresh(id: string): void {
  revalidatePath("/admin");
  revalidatePath(`/admin/requests/${id}`);
}

export async function changeStatus(
  requestId: string,
  nextStatus: string,
  note?: string
): Promise<ActionResult> {
  if (!isStatus(nextStatus)) {
    return { ok: false, error: `Unknown status: ${nextStatus}` };
  }

  const request = getRequest(requestId);
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status === nextStatus) return { ok: true };

  try {
    setStatus(requestId, nextStatus, ACTOR, note);
    refresh(requestId);
    return { ok: true };
  } catch (error) {
    console.error("Status change failed", error);
    return { ok: false, error: "Could not update the request." };
  }
}

export async function markCompleted(requestId: string): Promise<ActionResult> {
  return changeStatus(
    requestId,
    "Completed",
    "Work completed and signed off by the crew."
  );
}

/**
 * Undo a completion.
 *
 * Reverts to whatever the request was before it was closed, rather than
 * assuming "Submitted" - a job that was In Progress when someone fat-fingered
 * the button should go back to In Progress.
 */
export async function reopenRequest(requestId: string): Promise<ActionResult> {
  const request = getRequest(requestId);
  if (!request) return { ok: false, error: "Request not found." };

  const history = getStatusHistory(requestId);
  const priorOpen = [...history]
    .reverse()
    .find(
      (entry) =>
        entry.fromStatus !== null &&
        (OPEN_STATUSES as string[]).includes(entry.fromStatus)
    );

  return changeStatus(
    requestId,
    priorOpen?.fromStatus ?? "Triaged",
    "Reopened - closure reversed."
  );
}
