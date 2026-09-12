import { getDb } from "@/backend/db/client";
import {
  CLOSED_STATUSES,
  OPEN_STATUSES,
  type Classification,
  type DetectedHazard,
  type Feedback,
  type Fusion,
  type ImageFindings,
  type LocationSource,
  type RequestImage,
  type RequestStatus,
  type ReviewStatus,
  type ScoredRequest,
  type StatusChange,
  type TreeRequest,
} from "@/shared/types";
import { daysSince, scoreRequest } from "@/backend/domain/scoring";

/**
 * Every read path goes through here. Rows come out of SQLite in snake_case and
 * leave as camelCase domain objects; nothing above this file sees SQL.
 */

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface RequestRow {
  id: string;
  reference: string;
  reporter_name: string;
  reporter_email: string;
  address: string;
  street: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  location_source: string;
  description: string;
  submitted_at: string;
  status: string;
  duplicate_of_id: string | null;
  estimated_hours: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface JoinedRow extends RequestRow {
  danger_score: number | null;
  review_status: string | null;
  review_note: string | null;
  hazards_json: string | null;
  image_findings_json: string | null;
  fusion_json: string | null;
  engine_version: string | null;
  assessment_source: string | null;
  computed_at: string | null;
  image_count: number;
  duplicate_count: number;
}

function toRequest(row: RequestRow): TreeRequest {
  return {
    id: row.id,
    reference: row.reference,
    reporterName: row.reporter_name,
    reporterEmail: row.reporter_email,
    address: row.address,
    street: row.street,
    neighborhood: row.neighborhood,
    latitude: row.latitude,
    longitude: row.longitude,
    locationSource: row.location_source as LocationSource,
    description: row.description,
    submittedAt: row.submitted_at,
    status: row.status as RequestStatus,
    duplicateOfId: row.duplicate_of_id,
    estimatedHours: row.estimated_hours,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Rebuilds the live assessment for a row.
 *
 * A request with no current classification still has to render, so it falls
 * back to a zero-danger classification flagged for human review rather than
 * disappearing from the queue.
 */
function toScored(row: JoinedRow, now: Date): ScoredRequest {
  const request = toRequest(row);
  const daysWaiting = daysSince(request.submittedAt, now);

  const classification: Classification = {
    hazards: row.hazards_json
      ? (JSON.parse(row.hazards_json) as DetectedHazard[])
      : [],
    dangerScore: row.danger_score ?? 0,
    reviewStatus: (row.review_status as ReviewStatus | null) ?? "Unsure",
    reviewNote:
      row.review_note ?? "Not yet classified - awaiting automated assessment.",
    imageFindings: row.image_findings_json
      ? (JSON.parse(row.image_findings_json) as ImageFindings)
      : null,
    fusion: row.fusion_json
      ? (JSON.parse(row.fusion_json) as Fusion)
      : {
          verdict: "text-only",
          textDanger: row.danger_score ?? 0,
          imageDanger: null,
          note: "No photograph was analyzed. Score is based on the description alone.",
        },
    engineVersion: row.engine_version ?? "none",
    source: (row.assessment_source as Classification["source"] | null) ?? "text",
    computedAt: row.computed_at ?? request.createdAt,
  };

  return {
    ...request,
    daysWaiting,
    assessment: scoreRequest(classification, {
      daysWaiting,
      street: request.street,
    }),
    imageCount: row.image_count,
    duplicateCount: row.duplicate_count,
  };
}

const SELECT_JOINED = `
  SELECT r.*,
         a.danger_score,
         a.review_status,
         a.review_note,
         a.hazards_json,
         a.image_findings_json,
         a.fusion_json,
         a.engine_version,
         a.source AS assessment_source,
         a.computed_at,
         (SELECT COUNT(*) FROM images i WHERE i.request_id = r.id) AS image_count,
         (SELECT COUNT(*) FROM requests d WHERE d.duplicate_of_id = r.id) AS duplicate_count
  FROM requests r
  LEFT JOIN assessments a
    ON a.request_id = r.id AND a.is_current = 1
`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The active inspection queue, ranked highest-risk first.
 *
 * Ordering happens in JS, not SQL: the final score depends on wait time, which
 * is a function of "now" rather than a stored column.
 */
export function listOpenRequests(now: Date = new Date()): ScoredRequest[] {
  const placeholders = OPEN_STATUSES.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `${SELECT_JOINED} WHERE r.status IN (${placeholders}) AND r.duplicate_of_id IS NULL`
    )
    .all(...OPEN_STATUSES) as JoinedRow[];

  return rows.map((row) => toScored(row, now)).sort(compareByPriority);
}

export function listClosedRequests(now: Date = new Date()): ScoredRequest[] {
  const placeholders = CLOSED_STATUSES.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(`${SELECT_JOINED} WHERE r.status IN (${placeholders})`)
    .all(...CLOSED_STATUSES) as JoinedRow[];

  return rows.map((row) => toScored(row, now)).sort(compareByPriority);
}

export function listAllRequests(now: Date = new Date()): ScoredRequest[] {
  const rows = getDb().prepare(SELECT_JOINED).all() as JoinedRow[];
  return rows.map((row) => toScored(row, now)).sort(compareByPriority);
}

export function getRequest(
  id: string,
  now: Date = new Date()
): ScoredRequest | null {
  const row = getDb()
    .prepare(`${SELECT_JOINED} WHERE r.id = ? OR r.reference = ?`)
    .get(id, id) as JoinedRow | undefined;
  return row ? toScored(row, now) : null;
}

/** Other reports already linked to this one as the same tree. */
export function getDuplicatesOf(
  id: string,
  now: Date = new Date()
): ScoredRequest[] {
  const rows = getDb()
    .prepare(`${SELECT_JOINED} WHERE r.duplicate_of_id = ?`)
    .all(id) as JoinedRow[];
  return rows.map((row) => toScored(row, now));
}

export function getImages(requestId: string): RequestImage[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM images WHERE request_id = ? ORDER BY created_at ASC`
    )
    .all(requestId) as Array<{
    id: string;
    request_id: string;
    filename: string;
    mime_type: string;
    byte_size: number;
    exif_latitude: number | null;
    exif_longitude: number | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    exifLatitude: row.exif_latitude,
    exifLongitude: row.exif_longitude,
    createdAt: row.created_at,
  }));
}

export function getImage(imageId: string): RequestImage | null {
  const row = getDb()
    .prepare(`SELECT * FROM images WHERE id = ?`)
    .get(imageId) as
    | {
        id: string;
        request_id: string;
        filename: string;
        mime_type: string;
        byte_size: number;
        exif_latitude: number | null;
        exif_longitude: number | null;
        created_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    exifLatitude: row.exif_latitude,
    exifLongitude: row.exif_longitude,
    createdAt: row.created_at,
  };
}

export function getStatusHistory(requestId: string): StatusChange[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM status_history WHERE request_id = ? ORDER BY created_at ASC, id ASC`
    )
    .all(requestId) as Array<{
    id: number;
    request_id: string;
    from_status: string | null;
    to_status: string;
    actor: string;
    note: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    fromStatus: row.from_status as RequestStatus | null,
    toStatus: row.to_status as RequestStatus,
    actor: row.actor,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export function getFeedback(requestId: string): Feedback[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM feedback WHERE request_id = ? ORDER BY created_at DESC`
    )
    .all(requestId) as Array<{
    id: number;
    request_id: string;
    rating: number | null;
    comment: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  }));
}

export function countByStatus(): Record<string, number> {
  const rows = getDb()
    .prepare(`SELECT status, COUNT(*) AS n FROM requests GROUP BY status`)
    .all() as Array<{ status: string; n: number }>;
  return Object.fromEntries(rows.map((row) => [row.status, row.n]));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface NewRequestInput {
  id: string;
  reference: string;
  reporterName: string;
  reporterEmail: string;
  address: string;
  street: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: LocationSource;
  description: string;
  submittedAt: string;
  status?: RequestStatus;
  duplicateOfId?: string | null;
  estimatedHours?: number;
  completedAt?: string | null;
}

export function insertRequest(input: NewRequestInput): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO requests (
        id, reference, reporter_name, reporter_email, address, street,
        neighborhood, latitude, longitude, location_source, description,
        submitted_at, status, duplicate_of_id, estimated_hours, completed_at,
        created_at, updated_at
      ) VALUES (
        @id, @reference, @reporterName, @reporterEmail, @address, @street,
        @neighborhood, @latitude, @longitude, @locationSource, @description,
        @submittedAt, @status, @duplicateOfId, @estimatedHours, @completedAt,
        @createdAt, @updatedAt
      )`
    )
    .run({
      ...input,
      status: input.status ?? "Submitted",
      duplicateOfId: input.duplicateOfId ?? null,
      estimatedHours: input.estimatedHours ?? 2,
      completedAt: input.completedAt ?? null,
      createdAt: now,
      updatedAt: now,
    });
}

/** Writes a classification and retires whatever was current before it. */
export function saveClassification(
  requestId: string,
  classification: Classification
): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE assessments SET is_current = 0 WHERE request_id = ? AND is_current = 1`
    ).run(requestId);

    db.prepare(
      `INSERT INTO assessments (
        request_id, danger_score, review_status, review_note, hazards_json,
        image_findings_json, fusion_json, engine_version, source, computed_at,
        is_current
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      requestId,
      classification.dangerScore,
      classification.reviewStatus,
      classification.reviewNote,
      JSON.stringify(classification.hazards),
      classification.imageFindings
        ? JSON.stringify(classification.imageFindings)
        : null,
      JSON.stringify(classification.fusion),
      classification.engineVersion,
      classification.source,
      classification.computedAt
    );
  });
  tx();
}

export function insertImage(image: {
  id: string;
  requestId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  exifLatitude?: number | null;
  exifLongitude?: number | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO images (
        id, request_id, filename, mime_type, byte_size,
        exif_latitude, exif_longitude, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      image.id,
      image.requestId,
      image.filename,
      image.mimeType,
      image.byteSize,
      image.exifLatitude ?? null,
      image.exifLongitude ?? null,
      new Date().toISOString()
    );
}

export function recordStatusChange(change: {
  requestId: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actor: string;
  note?: string | null;
  createdAt?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO status_history (request_id, from_status, to_status, actor, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      change.requestId,
      change.fromStatus,
      change.toStatus,
      change.actor,
      change.note ?? null,
      change.createdAt ?? new Date().toISOString()
    );
}

/**
 * Moves a request to a new status and appends to its history in one
 * transaction, so the audit trail can never disagree with the row.
 */
export function setStatus(
  requestId: string,
  toStatus: RequestStatus,
  actor: string,
  note?: string
): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const current = db
      .prepare(`SELECT status FROM requests WHERE id = ?`)
      .get(requestId) as { status: string } | undefined;
    if (!current) throw new Error(`Unknown request: ${requestId}`);

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE requests
         SET status = ?,
             completed_at = CASE WHEN ? = 'Completed' THEN ? ELSE completed_at END,
             updated_at = ?
       WHERE id = ?`
    ).run(toStatus, toStatus, now, now, requestId);

    db.prepare(
      `INSERT INTO status_history (request_id, from_status, to_status, actor, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(requestId, current.status, toStatus, actor, note ?? null, now);
  });
  tx();
}

export function insertFeedback(input: {
  requestId: string;
  rating?: number | null;
  comment?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO feedback (request_id, rating, comment, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(
      input.requestId,
      input.rating ?? null,
      input.comment ?? null,
      new Date().toISOString()
    );
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/** Final score, then raw danger, then age. Matches the queue's default sort. */
function compareByPriority(a: ScoredRequest, b: ScoredRequest): number {
  if (b.assessment.finalScore !== a.assessment.finalScore) {
    return b.assessment.finalScore - a.assessment.finalScore;
  }
  if (b.assessment.breakdown.danger !== a.assessment.breakdown.danger) {
    return b.assessment.breakdown.danger - a.assessment.breakdown.danger;
  }
  return b.daysWaiting - a.daysWaiting;
}
