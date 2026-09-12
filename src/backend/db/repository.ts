import { query, queryOne, withTransaction } from "@/backend/db/client";
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
 * Every read path goes through here. Rows come out of Postgres in snake_case
 * and leave as camelCase domain objects; nothing above this file sees SQL.
 *
 * Two driver details the mappers absorb, so callers never think about them:
 *
 *   TIMESTAMPTZ  comes back as a JS `Date`. The domain speaks ISO strings, so
 *                `toIso()` normalises on the way out.
 *   JSONB        comes back already parsed. Do NOT call JSON.parse on it. On
 *                the way in it must be JSON.stringify'd - see the note in
 *                client.ts about arrays becoming Postgres array literals.
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
  submitted_at: Date | string;
  status: string;
  duplicate_of_id: string | null;
  estimated_hours: number;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface JoinedRow extends RequestRow {
  danger_score: number | null;
  review_status: string | null;
  review_note: string | null;
  hazards_json: DetectedHazard[] | null;
  image_findings_json: ImageFindings | null;
  fusion_json: Fusion | null;
  engine_version: string | null;
  assessment_source: string | null;
  computed_at: Date | string | null;
  image_count: string | number;
  duplicate_count: string | number;
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : value;
}

/** COUNT() returns bigint, which node-postgres hands back as a string. */
function toCount(value: string | number | null): number {
  return typeof value === "number" ? value : Number(value ?? 0);
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
    submittedAt: toIso(row.submitted_at),
    status: row.status as RequestStatus,
    duplicateOfId: row.duplicate_of_id,
    estimatedHours: Number(row.estimated_hours),
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
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
    // jsonb arrives parsed - no JSON.parse here.
    hazards: row.hazards_json ?? [],
    dangerScore: row.danger_score ?? 0,
    reviewStatus: (row.review_status as ReviewStatus | null) ?? "Unsure",
    reviewNote:
      row.review_note ?? "Not yet classified - awaiting automated assessment.",
    imageFindings: row.image_findings_json ?? null,
    fusion: row.fusion_json ?? {
      verdict: "text-only",
      textDanger: row.danger_score ?? 0,
      imageDanger: null,
      note: "No photograph was analyzed. Score is based on the description alone.",
    },
    engineVersion: row.engine_version ?? "none",
    source: (row.assessment_source as Classification["source"] | null) ?? "text",
    computedAt: row.computed_at ? toIso(row.computed_at) : request.createdAt,
  };

  return {
    ...request,
    daysWaiting,
    assessment: scoreRequest(classification, {
      daysWaiting,
      street: request.street,
    }),
    imageCount: toCount(row.image_count),
    duplicateCount: toCount(row.duplicate_count),
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
    ON a.request_id = r.id AND a.is_current
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
export async function listOpenRequests(
  now: Date = new Date()
): Promise<ScoredRequest[]> {
  const rows = await query<JoinedRow>(
    `${SELECT_JOINED} WHERE r.status = ANY($1) AND r.duplicate_of_id IS NULL`,
    [OPEN_STATUSES]
  );
  return rows.map((row) => toScored(row, now)).sort(compareByPriority);
}

export async function listClosedRequests(
  now: Date = new Date()
): Promise<ScoredRequest[]> {
  const rows = await query<JoinedRow>(
    `${SELECT_JOINED} WHERE r.status = ANY($1)`,
    [CLOSED_STATUSES]
  );
  return rows.map((row) => toScored(row, now)).sort(compareByPriority);
}

export async function listAllRequests(
  now: Date = new Date()
): Promise<ScoredRequest[]> {
  const rows = await query<JoinedRow>(SELECT_JOINED);
  return rows.map((row) => toScored(row, now)).sort(compareByPriority);
}

export async function getRequest(
  id: string,
  now: Date = new Date()
): Promise<ScoredRequest | null> {
  const row = await queryOne<JoinedRow>(
    `${SELECT_JOINED} WHERE r.id = $1 OR r.reference = $1`,
    [id]
  );
  return row ? toScored(row, now) : null;
}

/** Other reports already linked to this one as the same tree. */
export async function getDuplicatesOf(
  id: string,
  now: Date = new Date()
): Promise<ScoredRequest[]> {
  const rows = await query<JoinedRow>(
    `${SELECT_JOINED} WHERE r.duplicate_of_id = $1`,
    [id]
  );
  return rows.map((row) => toScored(row, now));
}

interface ImageRow {
  id: string;
  request_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  exif_latitude: number | null;
  exif_longitude: number | null;
  created_at: Date | string;
}

function toImage(row: ImageRow): RequestImage {
  return {
    id: row.id,
    requestId: row.request_id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    exifLatitude: row.exif_latitude,
    exifLongitude: row.exif_longitude,
    createdAt: toIso(row.created_at),
  };
}

export async function getImages(requestId: string): Promise<RequestImage[]> {
  const rows = await query<ImageRow>(
    `SELECT * FROM images WHERE request_id = $1 ORDER BY created_at ASC`,
    [requestId]
  );
  return rows.map(toImage);
}

export async function getImage(imageId: string): Promise<RequestImage | null> {
  const row = await queryOne<ImageRow>(`SELECT * FROM images WHERE id = $1`, [
    imageId,
  ]);
  return row ? toImage(row) : null;
}

export async function getStatusHistory(
  requestId: string
): Promise<StatusChange[]> {
  const rows = await query<{
    id: number;
    request_id: string;
    from_status: string | null;
    to_status: string;
    actor: string;
    note: string | null;
    created_at: Date | string;
  }>(
    `SELECT * FROM status_history WHERE request_id = $1 ORDER BY created_at ASC, id ASC`,
    [requestId]
  );

  return rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    fromStatus: row.from_status as RequestStatus | null,
    toStatus: row.to_status as RequestStatus,
    actor: row.actor,
    note: row.note,
    createdAt: toIso(row.created_at),
  }));
}

export async function getFeedback(requestId: string): Promise<Feedback[]> {
  const rows = await query<{
    id: number;
    request_id: string;
    rating: number | null;
    comment: string | null;
    created_at: Date | string;
  }>(`SELECT * FROM feedback WHERE request_id = $1 ORDER BY created_at DESC`, [
    requestId,
  ]);

  return rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: toIso(row.created_at),
  }));
}

export async function countByStatus(): Promise<Record<string, number>> {
  const rows = await query<{ status: string; n: string }>(
    `SELECT status, COUNT(*) AS n FROM requests GROUP BY status`
  );
  return Object.fromEntries(rows.map((row) => [row.status, toCount(row.n)]));
}

/** Next sequential human-readable reference for the current year. */
export async function nextReference(year: number): Promise<string> {
  const row = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM requests WHERE reference LIKE $1`,
    [`HFX-${year}-%`]
  );
  return `HFX-${year}-${String(toCount(row?.n ?? "0") + 1).padStart(4, "0")}`;
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

export async function insertRequest(input: NewRequestInput): Promise<void> {
  await query(
    `INSERT INTO requests (
       id, reference, reporter_name, reporter_email, address, street,
       neighborhood, latitude, longitude, location_source, description,
       submitted_at, status, duplicate_of_id, estimated_hours, completed_at,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
       now(), now()
     )`,
    [
      input.id,
      input.reference,
      input.reporterName,
      input.reporterEmail,
      input.address,
      input.street,
      input.neighborhood,
      input.latitude,
      input.longitude,
      input.locationSource,
      input.description,
      input.submittedAt,
      input.status ?? "Submitted",
      input.duplicateOfId ?? null,
      input.estimatedHours ?? 2,
      input.completedAt ?? null,
    ]
  );
}

/** Writes a classification and retires whatever was current before it. */
export async function saveClassification(
  requestId: string,
  classification: Classification
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE assessments SET is_current = FALSE
        WHERE request_id = $1 AND is_current`,
      [requestId]
    );

    await client.query(
      `INSERT INTO assessments (
         request_id, danger_score, review_status, review_note, hazards_json,
         image_findings_json, fusion_json, engine_version, source, computed_at,
         is_current
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)`,
      [
        requestId,
        classification.dangerScore,
        classification.reviewStatus,
        classification.reviewNote,
        // Stringified on purpose: see the jsonb note in client.ts.
        JSON.stringify(classification.hazards),
        classification.imageFindings
          ? JSON.stringify(classification.imageFindings)
          : null,
        JSON.stringify(classification.fusion),
        classification.engineVersion,
        classification.source,
        classification.computedAt,
      ]
    );
  });
}

export async function insertImage(image: {
  id: string;
  requestId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  exifLatitude?: number | null;
  exifLongitude?: number | null;
}): Promise<void> {
  await query(
    `INSERT INTO images (
       id, request_id, filename, mime_type, byte_size,
       exif_latitude, exif_longitude, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [
      image.id,
      image.requestId,
      image.filename,
      image.mimeType,
      image.byteSize,
      image.exifLatitude ?? null,
      image.exifLongitude ?? null,
    ]
  );
}

export async function recordStatusChange(change: {
  requestId: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actor: string;
  note?: string | null;
  createdAt?: string;
}): Promise<void> {
  await query(
    `INSERT INTO status_history (request_id, from_status, to_status, actor, note, created_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))`,
    [
      change.requestId,
      change.fromStatus,
      change.toStatus,
      change.actor,
      change.note ?? null,
      change.createdAt ?? null,
    ]
  );
}

/**
 * Moves a request to a new status and appends to its history in one
 * transaction, so the audit trail can never disagree with the row.
 */
export async function setStatus(
  requestId: string,
  toStatus: RequestStatus,
  actor: string,
  note?: string
): Promise<void> {
  await withTransaction(async (client) => {
    // FOR UPDATE: two dispatchers closing the same job must serialise, or the
    // history could record a transition that never happened.
    const current = await client.query<{ status: string }>(
      `SELECT status FROM requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    const from = current.rows[0];
    if (!from) throw new Error(`Unknown request: ${requestId}`);

    await client.query(
      `UPDATE requests
          SET status = $2,
              completed_at = CASE WHEN $2 = 'Completed' THEN now() ELSE completed_at END,
              updated_at = now()
        WHERE id = $1`,
      [requestId, toStatus]
    );

    await client.query(
      `INSERT INTO status_history (request_id, from_status, to_status, actor, note, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [requestId, from.status, toStatus, actor, note ?? null]
    );
  });
}

export async function insertFeedback(input: {
  requestId: string;
  rating?: number | null;
  comment?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO feedback (request_id, rating, comment, created_at)
     VALUES ($1, $2, $3, now())`,
    [input.requestId, input.rating ?? null, input.comment ?? null]
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
