import crypto from "node:crypto";

import { z } from "zod";

import { classifyComplaint, fuseClassification } from "../engine/scoring";
import { getDb } from "./db";
import {
  findDuplicateCandidates,
  pickAutoLink,
  type DuplicateCandidate,
} from "./duplicates";
import { extractGps } from "./exif";
import { resolveLocation } from "./geocode";
import {
  insertImage,
  insertRequest,
  listOpenRequests,
  recordStatusChange,
  saveClassification,
} from "./repository";
import {
  ACCEPTED_MIME_TYPES,
  MAX_IMAGE_BYTES,
  filenameFor,
  newImageId,
  writeImage,
} from "./storage";
import type { Classification, RequestStatus } from "./types";
import { analyzeImage, canAnalyze } from "./vision";

/**
 * The submission pipeline.
 *
 * One resident submission runs: validate -> store photo -> locate -> classify
 * text -> analyze photo -> fuse -> duplicate check -> persist.
 *
 * Every external step is optional and degrades locally, so a submission is
 * only ever rejected for bad input, never for an unavailable service.
 */

export const submissionSchema = z.object({
  reporterName: z.string().trim().min(2, "Please enter your name").max(120),
  reporterEmail: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .max(200),
  address: z
    .string()
    .trim()
    .min(5, "Please enter the street address or nearest intersection")
    .max(200),
  description: z
    .string()
    .trim()
    .min(10, "Please describe what you can see - at least a few words")
    .max(4000),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;

export interface SubmittedPhoto {
  data: Buffer;
  mimeType: string;
  originalName: string;
}

export interface IntakeResult {
  id: string;
  reference: string;
  status: RequestStatus;
  classification: Classification;
  location: { latitude: number | null; longitude: number | null; note: string };
  /** Set when the report was auto-linked to an existing tree. */
  linkedTo: { id: string; reference: string; reason: string } | null;
  /** Near-misses left for a human to confirm. */
  duplicateSuggestions: DuplicateCandidate[];
  photoAnalyzed: boolean;
}

/** Sequential, human-readable reference: HFX-2026-0431. */
function nextReference(): string {
  const year = new Date().getFullYear();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM requests WHERE reference LIKE ?`
    )
    .get(`HFX-${year}-%`) as { n: number };
  return `HFX-${year}-${String(row.n + 1).padStart(4, "0")}`;
}

/**
 * Crew hours budgeted for the job, from severity.
 *
 * A placeholder until crews record real durations, but it has to exist: the
 * same-day bundling feature needs to know how much of a shift each job eats.
 */
export function estimateHours(dangerScore: number): number {
  if (dangerScore >= 80) return 6;
  if (dangerScore >= 60) return 4.5;
  if (dangerScore >= 40) return 3;
  if (dangerScore >= 20) return 2;
  return 1;
}

export function validatePhoto(photo: SubmittedPhoto): string | null {
  if (!ACCEPTED_MIME_TYPES.includes(photo.mimeType)) {
    return `Unsupported image type. Accepted: JPEG, PNG, WebP, HEIC.`;
  }
  if (photo.data.byteLength > MAX_IMAGE_BYTES) {
    return `Image is too large. Maximum ${Math.round(
      MAX_IMAGE_BYTES / (1024 * 1024)
    )} MB.`;
  }
  return null;
}

export async function submitRequest(
  input: SubmissionInput,
  photo: SubmittedPhoto | null
): Promise<IntakeResult> {
  const id = crypto.randomUUID();
  const reference = nextReference();
  const submittedAt = new Date().toISOString();

  // --- Location: photo GPS beats the typed address -------------------------
  const exif = photo ? await extractGps(photo.data) : null;
  const location = await resolveLocation({ address: input.address, exif });

  // --- Classification: text first, then the photo ---------------------------
  let classification = classifyComplaint(input.description);
  let photoAnalyzed = false;

  if (photo && canAnalyze(photo.mimeType)) {
    const findings = await analyzeImage(
      photo.data,
      photo.mimeType,
      input.description
    );
    if (findings) {
      classification = fuseClassification(classification, findings);
      photoAnalyzed = true;
    }
  }

  // --- Duplicate check against everything currently open --------------------
  const candidates = findDuplicateCandidates(
    {
      id,
      description: input.description,
      submittedAt,
      latitude: location.latitude,
      longitude: location.longitude,
      street: location.street,
    },
    listOpenRequests()
  );
  const autoLink = pickAutoLink(candidates);
  const status: RequestStatus = autoLink ? "Duplicate" : "Submitted";

  // --- Persist --------------------------------------------------------------
  insertRequest({
    id,
    reference,
    reporterName: input.reporterName,
    reporterEmail: input.reporterEmail,
    address: input.address,
    street: location.street,
    neighborhood: location.neighborhood,
    latitude: location.latitude,
    longitude: location.longitude,
    locationSource: location.source,
    description: input.description,
    submittedAt,
    status,
    duplicateOfId: autoLink ? autoLink.request.id : null,
    estimatedHours: estimateHours(classification.dangerScore),
  });

  saveClassification(id, classification);

  recordStatusChange({
    requestId: id,
    fromStatus: null,
    toStatus: "Submitted",
    actor: input.reporterName,
    note: "Submitted via public form",
    createdAt: submittedAt,
  });

  if (autoLink) {
    recordStatusChange({
      requestId: id,
      fromStatus: "Submitted",
      toStatus: "Duplicate",
      actor: "system",
      note: `Auto-linked to ${autoLink.request.reference}. ${autoLink.reason}`,
    });
  }

  if (photo) {
    const imageId = newImageId();
    const filename = filenameFor(imageId, photo.mimeType);
    await writeImage(filename, photo.data);
    insertImage({
      id: imageId,
      requestId: id,
      filename,
      mimeType: photo.mimeType,
      byteSize: photo.data.byteLength,
      exifLatitude: exif?.latitude ?? null,
      exifLongitude: exif?.longitude ?? null,
    });
  }

  return {
    id,
    reference,
    status,
    classification,
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      note: location.note,
    },
    linkedTo: autoLink
      ? {
          id: autoLink.request.id,
          reference: autoLink.request.reference,
          reason: autoLink.reason,
        }
      : null,
    // Anything that looked close but did not clear the bar stays visible to a
    // human rather than being silently dropped.
    duplicateSuggestions: autoLink ? [] : candidates.slice(0, 3),
    photoAnalyzed,
  };
}
