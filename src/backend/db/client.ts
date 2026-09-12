import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * PostgreSQL connection and schema.
 *
 * Connection comes from `DATABASE_URL`, or from the standard `PG*` variables
 * (`PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT`) which the driver
 * reads on its own when no connection string is supplied.
 *
 * The schema is applied once per process on first query, so `npm run dev` works
 * against an empty database with no separate migration step. That is a
 * deliberate trade for a project at this stage; a real deployment wants
 * versioned, reviewable migrations instead.
 */

export interface ConnectionSettings {
  connectionString: string | undefined;
  ssl: { rejectUnauthorized: boolean } | false;
}

/**
 * Builds the connection settings, deliberately stripping `sslmode` from the URL.
 *
 * WHY: as of pg 8.23, `sslmode=require` in a connection string is treated as an
 * alias for `verify-full` - and a connection-string SSL mode overrides the
 * `ssl` option object. Supabase terminates TLS with a chain that is not in
 * Node's default trust store, so leaving `sslmode=require` in the URL makes
 * every connection fail with "self-signed certificate in certificate chain",
 * no matter what `rejectUnauthorized` is set to.
 *
 * Removing the parameter and driving TLS entirely from the `ssl` object keeps
 * the behaviour explicit and version-proof. TLS stays ON; only certificate
 * *verification* is opt-in via DATABASE_SSL_STRICT.
 */
export function connectionSettings(): ConnectionSettings {
  const raw = process.env.DATABASE_URL;
  const strict = process.env.DATABASE_SSL_STRICT === "true";

  if (!raw) {
    // No URL: the driver falls back to PG* environment variables.
    return { connectionString: undefined, ssl: { rejectUnauthorized: strict } };
  }

  const url = new URL(raw);
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");

  return {
    connectionString: url.toString(),
    ssl: sslmode === "disable" ? false : { rejectUnauthorized: strict },
  };
}

const globalForDb = globalThis as unknown as {
  __treePool?: Pool;
  __treeSchema?: Promise<void>;
};

export function getPool(): Pool {
  if (!globalForDb.__treePool) {
    const { connectionString, ssl } = connectionSettings();
    globalForDb.__treePool = new Pool({
      connectionString,
      ssl,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    // An idle client erroring out must not take the process down.
    globalForDb.__treePool.on("error", (error) => {
      console.error("Unexpected Postgres client error", error);
    });
  }
  return globalForDb.__treePool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS requests (
  id              TEXT PRIMARY KEY,
  reference       TEXT NOT NULL UNIQUE,
  reporter_name   TEXT NOT NULL,
  reporter_email  TEXT NOT NULL,
  address         TEXT NOT NULL,
  street          TEXT NOT NULL,
  neighborhood    TEXT NOT NULL,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  location_source TEXT NOT NULL DEFAULT 'manual',
  description     TEXT NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Submitted',
  duplicate_of_id TEXT REFERENCES requests(id) ON DELETE SET NULL,
  estimated_hours DOUBLE PRECISION NOT NULL DEFAULT 2,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_submitted ON requests(submitted_at);
CREATE INDEX IF NOT EXISTS idx_requests_duplicate ON requests(duplicate_of_id);
-- Bounding-box prefilter for the same-day bundling query.
CREATE INDEX IF NOT EXISTS idx_requests_geo ON requests(latitude, longitude);

CREATE TABLE IF NOT EXISTS images (
  id             TEXT PRIMARY KEY,
  request_id     TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  filename       TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  byte_size      INTEGER NOT NULL,
  exif_latitude  DOUBLE PRECISION,
  exif_longitude DOUBLE PRECISION,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_images_request ON images(request_id);

-- One row per classification run. Keeping history means a re-classification
-- after a rule change is additive, and the old verdict stays auditable.
CREATE TABLE IF NOT EXISTS assessments (
  id                  SERIAL PRIMARY KEY,
  request_id          TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  danger_score        INTEGER NOT NULL,
  review_status       TEXT NOT NULL,
  review_note         TEXT NOT NULL,
  hazards_json        JSONB NOT NULL,
  image_findings_json JSONB,
  fusion_json         JSONB,
  engine_version      TEXT NOT NULL,
  source              TEXT NOT NULL,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_current          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Partial index: every lookup asks for the current row only.
CREATE INDEX IF NOT EXISTS idx_assessments_current
  ON assessments(request_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS status_history (
  id          SERIAL PRIMARY KEY,
  request_id  TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor       TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_history_request ON status_history(request_id);

CREATE TABLE IF NOT EXISTS feedback (
  id         SERIAL PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  rating     INTEGER,
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_request ON feedback(request_id);
`;

/**
 * Additive column migrations.
 *
 * Postgres supports IF NOT EXISTS on ADD COLUMN, so these are safe to re-run
 * and need no information_schema probing.
 */
const MIGRATIONS = `
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS image_findings_json JSONB;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS fusion_json JSONB;
`;

/** Applied once per process; concurrent callers await the same promise. */
export function ensureSchema(): Promise<void> {
  if (!globalForDb.__treeSchema) {
    globalForDb.__treeSchema = (async () => {
      const pool = getPool();
      await pool.query(SCHEMA);
      await pool.query(MIGRATIONS);
    })().catch((error) => {
      // Let the next caller retry rather than caching a failed init.
      globalForDb.__treeSchema = undefined;
      throw error;
    });
  }
  return globalForDb.__treeSchema;
}

/**
 * Runs a parameterised query, applying the schema first.
 *
 * NOTE ON JSONB PARAMETERS: always pass `JSON.stringify(value)`, never the
 * object itself. node-postgres converts a JS array into a Postgres *array*
 * literal, which a jsonb column rejects - and `hazards` is an array. Sending
 * text lets Postgres cast it to jsonb correctly.
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** Single-row convenience. Returns null rather than undefined. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Runs `fn` inside a transaction on a dedicated client.
 *
 * Every statement in `fn` must use the passed client - using the pool instead
 * would silently run outside the transaction on a different connection.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Drops every table and rebuilds the schema. Used by `npm run db:reset`. */
export async function dropAll(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    DROP TABLE IF EXISTS feedback CASCADE;
    DROP TABLE IF EXISTS status_history CASCADE;
    DROP TABLE IF EXISTS assessments CASCADE;
    DROP TABLE IF EXISTS images CASCADE;
    DROP TABLE IF EXISTS requests CASCADE;
  `);
  globalForDb.__treeSchema = undefined;
  await ensureSchema();
}

/** Closes the pool. Only for one-shot scripts such as the seeder. */
export async function closePool(): Promise<void> {
  if (globalForDb.__treePool) {
    await globalForDb.__treePool.end();
    globalForDb.__treePool = undefined;
    globalForDb.__treeSchema = undefined;
  }
}
