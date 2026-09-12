import {
  supabaseFetch,
  supabaseFetchOne,
  supabaseCount,
} from "@/backend/db/client";
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
 * Every read path goes through here. Rows come out of Supabase REST in snake_case
 * and leave as camelCase domain objects; nothing above this file sees the REST API.
 *
 * PostgREST returns JSON columns already parsed and timestamps as ISO strings,
 * so the mappers are simpler than the old pg versions.
 */

// ---------------------------------------------------------------------------
// Row shapes (match the Supabase table columns)
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

interface AssessmentRow {
  id: number;
  request_id: string;
  danger_score: number;
  review_status: string;
  review_note: string;
  hazards_json: DetectedHazard[] | null;
  image_findings_json: ImageFindings | null;
  fusion_json: Fusion | null;
  engine_version: string;
  source: string;
  computed_at: string;
  is_current: boolean;
}

/** A request joined with its current assessment + counts. */
interface JoinedRow extends RequestRow {
  danger_score: number | null;
  review_status: string | null;
  review_note: string | null;
  hazards_json: DetectedHazard[] | null;
  image_findings_json: ImageFindings | null;
  fusion_json: Fusion | null;
  engine_version: string | null;
  assessment_source: string | null;
  computed_at: string | null;
  image_count: number;
  duplicate_count: number;
}

function toIso(value: string | null | undefined): string {
  return value ?? "";
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
    // JSON columns arrive parsed from PostgREST.
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
    imageCount: row.image_count ?? 0,
    duplicateCount: row.duplicate_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Helper: fetch requests + join assessments + counts (replaces SELECT_JOINED)
// ---------------------------------------------------------------------------

/**
 * Fetches requests with filters, then enriches each with its current
 * assessment and image/duplicate counts. PostgREST doesn't do LEFT JOINs
 * with subqueries, so we make parallel calls and stitch in JS.
 */
async function fetchScoredRequests(
  requestFilters: Record<string, string>,
  now: Date
): Promise<ScoredRequest[]> {
  // 1. Fetch matching requests
  const requests = await supabaseFetch<RequestRow[]>("requests", "GET", undefined, {
    select: "*",
    filters: requestFilters,
    limit: 1000,
  });

  if (!requests || requests.length === 0) return [];

  // 2. Fetch current assessments for those requests (in one call using `in`)
  const requestIds = requests.map((r) => r.id);
  const assessments = await supabaseFetch<AssessmentRow[]>(
    "assessments",
    "GET",
    undefined,
    {
      select: "*",
      filters: {
        request_id: `in.(${requestIds.join(",")})`,
        is_current: "eq.true",
      },
      limit: 1000,
    }
  );

  // Build a lookup map: requestId → assessment
  const assessmentMap = new Map<string, AssessmentRow>();
  if (assessments) {
    for (const a of assessments) {
      assessmentMap.set(a.request_id, a);
    }
  }

  // 3. Fetch image counts and duplicate counts in parallel
  // For image counts: group images by request_id
  // For duplicate counts: group requests by duplicate_of_id
  const [imageRows, duplicateRows] = await Promise.all([
    supabaseFetch<{ request_id: string }[]>("images", "GET", undefined, {
      select: "request_id",
      filters: { request_id: `in.(${requestIds.join(",")})` },
      limit: 10000,
    }),
    // Duplicates: requests whose duplicate_of_id is one of our request IDs
    supabaseFetch<{ duplicate_of_id: string }[]>("requests", "GET", undefined, {
      select: "duplicate_of_id",
      filters: { duplicate_of_id: `in.(${requestIds.join(",")})` },
      limit: 10000,
    }),
  ]);

  // Count images per request
  const imageCountMap = new Map<string, number>();
  if (imageRows) {
    for (const row of imageRows) {
      imageCountMap.set(row.request_id, (imageCountMap.get(row.request_id) ?? 0) + 1);
    }
  }

  // Count duplicates per request
  const duplicateCountMap = new Map<string, number>();
  if (duplicateRows) {
    for (const row of duplicateRows) {
      if (row.duplicate_of_id) {
        duplicateCountMap.set(
          row.duplicate_of_id,
          (duplicateCountMap.get(row.duplicate_of_id) ?? 0) + 1
        );
      }
    }
  }

  // 4. Stitch together into JoinedRow → ScoredRequest
  const joined: JoinedRow[] = requests.map((r) => {
    const a = assessmentMap.get(r.id);
    return {
      ...r,
      danger_score: a?.danger_score ?? null,
      review_status: a?.review_status ?? null,
      review_note: a?.review_note ?? null,
      hazards_json: a?.hazards_json ?? null,
      image_findings_json: a?.image_findings_json ?? null,
      fusion_json: a?.fusion_json ?? null,
      engine_version: a?.engine_version ?? null,
      assessment_source: a?.source ?? null,
      computed_at: a?.computed_at ?? null,
      image_count: imageCountMap.get(r.id) ?? 0,
      duplicate_count: duplicateCountMap.get(r.id) ?? 0,
    };
  });

  return joined.map((row) => toScored(row, now)).sort(compareByPriority);
}

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
  // status=in.(...) AND duplicate_of_id=is.null
  return fetchScoredRequests(
    {
      status: `in.(${OPEN_STATUSES.join(",")})`,
      duplicate_of_id: "is.null",
    },
    now
  );
}

export async function listClosedRequests(
  now: Date = new Date()
): Promise<ScoredRequest[]> {
  return fetchScoredRequests(
    {
      status: `in.(${CLOSED_STATUSES.join(",")})`,
    },
    now
  );
}

export async function listAllRequests(
  now: Date = new Date()
): Promise<ScoredRequest[]> {
  return fetchScoredRequests({}, now);
}

export async function getRequest(
  id: string,
  now: Date = new Date()
): Promise<ScoredRequest | null> {
  // Try by id first, then by reference. PostgREST uses `or` for this.
  const requests = await supabaseFetch<RequestRow[]>("requests", "GET", undefined, {
    select: "*",
    filters: { or: `(id.eq.${id},reference.eq.${id})` },
    limit: 1,
  });

  if (!requests || requests.length === 0) return null;
  const req = requests[0];

  // Fetch current assessment
  const assessment = await supabaseFetchOne<AssessmentRow>("assessments", {
    select: "*",
    filters: { request_id: `eq.${req.id}`, is_current: "eq.true" },
  });

  // Fetch counts
  const [imageCount, duplicateCount] = await Promise.all([
    supabaseCount("images", { request_id: `eq.${req.id}` }),
    supabaseCount("requests", { duplicate_of_id: `eq.${req.id}` }),
  ]);

  const joined: JoinedRow = {
    ...req,
    danger_score: assessment?.danger_score ?? null,
    review_status: assessment?.review_status ?? null,
    review_note: assessment?.review_note ?? null,
    hazards_json: assessment?.hazards_json ?? null,
    image_findings_json: assessment?.image_findings_json ?? null,
    fusion_json: assessment?.fusion_json ?? null,
    engine_version: assessment?.engine_version ?? null,
    assessment_source: assessment?.source ?? null,
    computed_at: assessment?.computed_at ?? null,
    image_count: imageCount,
    duplicate_count: duplicateCount,
  };

  return toScored(joined, now);
}

/** Other reports already linked to this one as the same tree. */
export async function getDuplicatesOf(
  id: string,
  now: Date = new Date()
): Promise<ScoredRequest[]> {
  return fetchScoredRequests({ duplicate_of_id: `eq.${id}` }, now);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

interface ImageRow {
  id: string;
  request_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  data: string | null;
  exif_latitude: number | null;
  exif_longitude: number | null;
  created_at: string;
}

function toImage(row: ImageRow): RequestImage {
  return {
    id: row.id,
    requestId: row.request_id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    data: row.data ?? null,
    exifLatitude: row.exif_latitude,
    exifLongitude: row.exif_longitude,
    createdAt: toIso(row.created_at),
  };
}

export async function getImages(requestId: string): Promise<RequestImage[]> {
  const rows = await supabaseFetch<ImageRow[]>("images", "GET", undefined, {
    select: "*",
    filters: { request_id: `eq.${requestId}` },
    order: "created_at.asc",
    limit: 1000,
  });
  return rows ? rows.map(toImage) : [];
}

export async function getImage(imageId: string): Promise<RequestImage | null> {
  const row = await supabaseFetchOne<ImageRow>("images", {
    select: "*",
    filters: { id: `eq.${imageId}` },
  });
  return row ? toImage(row) : null;
}

// ---------------------------------------------------------------------------
// Status history
// ---------------------------------------------------------------------------

export async function getStatusHistory(
  requestId: string
): Promise<StatusChange[]> {
  const rows = await supabaseFetch<
    {
      id: number;
      request_id: string;
      from_status: string | null;
      to_status: string;
      actor: string;
      note: string | null;
      created_at: string;
    }[]
  >("status_history", "GET", undefined, {
    select: "*",
    filters: { request_id: `eq.${requestId}` },
    order: "created_at.asc,id.asc",
    limit: 1000,
  });

  return rows
    ? rows.map((row) => ({
        id: row.id,
        requestId: row.request_id,
        fromStatus: row.from_status as RequestStatus | null,
        toStatus: row.to_status as RequestStatus,
        actor: row.actor,
        note: row.note,
        createdAt: toIso(row.created_at),
      }))
    : [];
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export async function getFeedback(requestId: string): Promise<Feedback[]> {
  const rows = await supabaseFetch<
    {
      id: number;
      request_id: string;
      rating: number | null;
      comment: string | null;
      created_at: string;
    }[]
  >("feedback", "GET", undefined, {
    select: "*",
    filters: { request_id: `eq.${requestId}` },
    order: "created_at.desc",
    limit: 1000,
  });

  return rows
    ? rows.map((row) => ({
        id: row.id,
        requestId: row.request_id,
        rating: row.rating,
        comment: row.comment,
        createdAt: toIso(row.created_at),
      }))
    : [];
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export async function countByStatus(): Promise<Record<string, number>> {
  // PostgREST doesn't support GROUP BY, so fetch all statuses and count in JS.
  const rows = await supabaseFetch<{ status: string }[]>("requests", "GET", undefined, {
    select: "status",
    limit: 10000,
  });

  const counts: Record<string, number> = {};
  if (rows) {
    for (const row of rows) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
  }
  return counts;
}

/** Next sequential human-readable reference for the current year. */
export async function nextReference(year: number): Promise<string> {
  const count = await supabaseCount("requests", {
    reference: `like.HFX-${year}-%`,
  });
  return `HFX-${year}-${String(count + 1).padStart(4, "0")}`;
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
  await supabaseFetch("requests", "POST", {
    id: input.id,
    reference: input.reference,
    reporter_name: input.reporterName,
    reporter_email: input.reporterEmail,
    address: input.address,
    street: input.street,
    neighborhood: input.neighborhood,
    latitude: input.latitude,
    longitude: input.longitude,
    location_source: input.locationSource,
    description: input.description,
    submitted_at: input.submittedAt,
    status: input.status ?? "Submitted",
    duplicate_of_id: input.duplicateOfId ?? null,
    estimated_hours: input.estimatedHours ?? 2,
    completed_at: input.completedAt ?? null,
  });
}

/**
 * Writes a classification and retires whatever was current before it.
 *
 * Without transactions in REST API, we do two sequential calls:
 *   1. PATCH old current assessments → is_current = false
 *   2. POST new assessment with is_current = true
 */
export async function saveClassification(
  requestId: string,
  classification: Classification
): Promise<void> {
  // 1. Retire old current assessment(s) for this request
  await supabaseFetch("assessments", "PATCH", { is_current: false }, {
    filters: { request_id: `eq.${requestId}`, is_current: "eq.true" },
  });

  // 2. Insert new current assessment
  await supabaseFetch("assessments", "POST", {
    request_id: requestId,
    danger_score: classification.dangerScore,
    review_status: classification.reviewStatus,
    review_note: classification.reviewNote,
    hazards_json: classification.hazards,
    image_findings_json: classification.imageFindings ?? null,
    fusion_json: classification.fusion,
    engine_version: classification.engineVersion,
    source: classification.source,
    computed_at: classification.computedAt,
    is_current: true,
  });
}

export async function insertImage(image: {
  id: string;
  requestId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  data?: string | null;
  exifLatitude?: number | null;
  exifLongitude?: number | null;
}): Promise<void> {
  await supabaseFetch("images", "POST", {
    id: image.id,
    request_id: image.requestId,
    filename: image.filename,
    mime_type: image.mimeType,
    byte_size: image.byteSize,
    data: image.data ?? null,
    exif_latitude: image.exifLatitude ?? null,
    exif_longitude: image.exifLongitude ?? null,
  });
}

export async function recordStatusChange(change: {
  requestId: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actor: string;
  note?: string | null;
  createdAt?: string;
}): Promise<void> {
  await supabaseFetch("status_history", "POST", {
    request_id: change.requestId,
    from_status: change.fromStatus,
    to_status: change.toStatus,
    actor: change.actor,
    note: change.note ?? null,
    created_at: change.createdAt ?? new Date().toISOString(),
  });
}

/**
 * Moves a request to a new status and appends to its history.
 *
 * Without transactions, we do sequential calls. The audit trail could
 * theoretically disagree if the second call fails, but the window is tiny.
 */
export async function setStatus(
  requestId: string,
  toStatus: RequestStatus,
  actor: string,
  note?: string
): Promise<void> {
  // 1. Fetch current status
  const current = await supabaseFetchOne<{ status: string }>("requests", {
    select: "status",
    filters: { id: `eq.${requestId}` },
  });

  if (!current) throw new Error(`Unknown request: ${requestId}`);

  // 2. Update request status
  const updateBody: Record<string, unknown> = {
    status: toStatus,
    updated_at: new Date().toISOString(),
  };
  if (toStatus === "Completed") {
    updateBody.completed_at = new Date().toISOString();
  }
  await supabaseFetch("requests", "PATCH", updateBody, {
    filters: { id: `eq.${requestId}` },
  });

  // 3. Record status change in history
  await supabaseFetch("status_history", "POST", {
    request_id: requestId,
    from_status: current.status,
    to_status: toStatus,
    actor,
    note: note ?? null,
    created_at: new Date().toISOString(),
  });
}

export async function insertFeedback(input: {
  requestId: string;
  rating?: number | null;
  comment?: string | null;
}): Promise<void> {
  await supabaseFetch("feedback", "POST", {
    request_id: input.requestId,
    rating: input.rating ?? null,
    comment: input.comment ?? null,
  });
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
