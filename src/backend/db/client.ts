/**
 * Supabase REST API client (PostgREST).
 *
 * Replaces the direct Postgres (`pg` driver) connection with HTTP calls to the
 * Supabase REST endpoint. This avoids needing a DATABASE_URL or direct TCP
 * access to Postgres — it works entirely through the publishable key already
 * in `.env.local`.
 *
 * The REST endpoint is `https://<project>.supabase.co/rest/v1/<table>`.
 * Authentication is via the `apikey` header (publishable or service-role key).
 *
 * PostgREST conventions used here:
 *   - `select=<columns>`     chooses which columns come back
 *   - `?column=eq.value`     filters (also `in`, `lt`, `gt`, `is`, `like`, …)
 *   - `order=col.asc`        sorting
 *   - `limit=N`              row cap
 *   - `Prefer: return=representation`  makes POST/PATCH return the affected rows
 *   - `Prefer: count=exact`  includes a Content-Range header for counts
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Base URL for the Supabase project (no trailing slash). */
export function supabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "https://xwmraxdxmqxtedvzhpgx.supabase.co"
  );
}

/** API key for PostgREST (publishable key works for reads + writes if RLS allows). */
export function supabaseKey(): string {
  return (
    process.env.SUPABASE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_xC7qMbW3JhgQRZfsSIucoA_rDCt20eb"
  );
}

/** Full REST base URL. */
function restBaseUrl(): string {
  return `${supabaseUrl()}/rest/v1`;
}

// ---------------------------------------------------------------------------
// Low-level fetch wrapper
// ---------------------------------------------------------------------------

export interface SupabaseQueryParams {
  /** Column list for PostgREST `select` (e.g. "*" or "id,reference,status"). */
  select?: string;
  /** Filter params, e.g. { status: "eq.Submitted", id: "eq.r-123" }. */
  filters?: Record<string, string>;
  /** Order, e.g. "created_at.asc". */
  order?: string;
  /** Row limit. */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
}

/**
 * Core REST call. Returns parsed JSON (or null for empty responses).
 *
 * For GET requests, filters/order/limit are encoded as query params.
 * For POST/PATCH/DELETE, the body is JSON and `Prefer` headers control
 * whether the affected rows are returned.
 */
export async function supabaseFetch<T = unknown>(
  table: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
  params?: SupabaseQueryParams
): Promise<T> {
  const url = new URL(`${restBaseUrl()}/${table}`);

  const headers: Record<string, string> = {
    apikey: supabaseKey(),
    "Content-Type": "application/json",
  };

  if (method === "GET" && params) {
    if (params.select) url.searchParams.set("select", params.select);
    if (params.order) url.searchParams.set("order", params.order);
    if (params.limit != null) url.searchParams.set("limit", String(params.limit));
    if (params.offset != null) url.searchParams.set("offset", String(params.offset));
  }

  // Filters apply to GET, PATCH, and DELETE — PostgREST requires a WHERE
  // clause for PATCH/DELETE, supplied as query params (e.g. ?id=eq.123).
  if (params?.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      url.searchParams.set(key, value);
    }
  }

  if (method === "POST" || method === "PATCH") {
    headers["Prefer"] = "return=representation";
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Supabase REST ${method} ${table} failed (${response.status}): ${text}`
    );
  }

  // 204 No Content or empty body
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Fetches a single row by exact-match filters. Returns null if no match.
 */
export async function supabaseFetchOne<T = unknown>(
  table: string,
  params: SupabaseQueryParams
): Promise<T | null> {
  const rows = await supabaseFetch<T[]>(table, "GET", undefined, {
    ...params,
    limit: 1,
  });
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * Gets the total count of rows matching a filter, using the `Prefer: count=exact`
 * header and parsing the Content-Range response header.
 */
export async function supabaseCount(
  table: string,
  filters?: Record<string, string>
): Promise<number> {
  const url = new URL(`${restBaseUrl()}/${table}`);
  url.searchParams.set("select", "id");
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      url.searchParams.set(key, value);
    }
  }
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: supabaseKey(),
      "Content-Type": "application/json",
      Prefer: "count=exact",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Supabase count ${table} failed (${response.status}): ${text}`
    );
  }

  // Content-Range: 0-0/42  or  0-0/*
  const range = response.headers.get("content-range") ?? "";
  const match = range.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// ---------------------------------------------------------------------------
// Compatibility shims (so existing imports don't break)
// ---------------------------------------------------------------------------

/**
 * No-op — tables already exist in Supabase. Kept so `ensureSchema()` calls
 * in the codebase don't crash.
 */
export async function ensureSchema(): Promise<void> {
  // Tables are managed in Supabase dashboard; nothing to do here.
}

/** No-op for REST API — no pool to close. */
export async function closePool(): Promise<void> {
  // No persistent connection to close with REST API.
}

/** No-op — can't drop tables via REST API. */
export async function dropAll(): Promise<void> {
  console.warn("dropAll() is not supported via Supabase REST API.");
}

// ---------------------------------------------------------------------------
// Connection settings (kept for check.ts compatibility, but not used for REST)
// ---------------------------------------------------------------------------

export interface ConnectionSettings {
  connectionString: string | undefined;
  ssl: { rejectUnauthorized: boolean } | false;
}

export function connectionSettings(): ConnectionSettings {
  return {
    connectionString: undefined,
    ssl: false,
  };
}
