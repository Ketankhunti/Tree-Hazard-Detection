import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

/**
 * SQLite connection and schema.
 *
 * The schema is applied idempotently on first access, so there is no separate
 * migration step to run before `npm run dev` works. Good enough for a project
 * at this stage; a real deployment would move to versioned migrations.
 */

export const DATABASE_PATH = path.resolve(
  process.cwd(),
  process.env.DATABASE_PATH ?? "var/app.db"
);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS requests (
  id              TEXT PRIMARY KEY,
  reference       TEXT NOT NULL UNIQUE,
  reporter_name   TEXT NOT NULL,
  reporter_email  TEXT NOT NULL,
  address         TEXT NOT NULL,
  street          TEXT NOT NULL,
  neighborhood    TEXT NOT NULL,
  latitude        REAL,
  longitude       REAL,
  location_source TEXT NOT NULL DEFAULT 'manual',
  description     TEXT NOT NULL,
  submitted_at    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Submitted',
  duplicate_of_id TEXT REFERENCES requests(id) ON DELETE SET NULL,
  estimated_hours REAL NOT NULL DEFAULT 2,
  completed_at    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
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
  exif_latitude  REAL,
  exif_longitude REAL,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_request ON images(request_id);

-- One row per classification run. Keeping history means a re-classification
-- after a rule change is additive, and the old verdict stays auditable.
CREATE TABLE IF NOT EXISTS assessments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id     TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  danger_score   INTEGER NOT NULL,
  review_status  TEXT NOT NULL,
  review_note    TEXT NOT NULL,
  hazards_json   TEXT NOT NULL,
  image_findings_json TEXT,
  fusion_json    TEXT,
  engine_version TEXT NOT NULL,
  source         TEXT NOT NULL,
  computed_at    TEXT NOT NULL,
  is_current     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_assessments_current
  ON assessments(request_id, is_current);

CREATE TABLE IF NOT EXISTS status_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor       TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_status_history_request ON status_history(request_id);

CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  rating     INTEGER,
  comment    TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_request ON feedback(request_id);
`;

export type DB = Database.Database;

/**
 * Additive column migrations.
 *
 * `CREATE TABLE IF NOT EXISTS` will not add a column to a table that already
 * exists, so a database seeded before a column was introduced would break on
 * read. Each entry is applied only when the column is genuinely absent.
 */
const ADDED_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  {
    table: "assessments",
    column: "image_findings_json",
    ddl: "ALTER TABLE assessments ADD COLUMN image_findings_json TEXT",
  },
  {
    table: "assessments",
    column: "fusion_json",
    ddl: "ALTER TABLE assessments ADD COLUMN fusion_json TEXT",
  },
];

function migrate(db: DB): void {
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (columns.length > 0 && !columns.some((c) => c.name === column)) {
      db.exec(ddl);
    }
  }
}

function create(): DB {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

  const db = new Database(DATABASE_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Next.js hot-reloads server modules in dev; without this the process would
// accumulate a new SQLite handle on every edit.
const globalForDb = globalThis as unknown as { __treeDb?: DB };

export function getDb(): DB {
  if (!globalForDb.__treeDb) {
    globalForDb.__treeDb = create();
  }
  return globalForDb.__treeDb;
}

/** Drops every table. Used by `npm run db:reset`. */
export function dropAll(db: DB): void {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS feedback;
    DROP TABLE IF EXISTS status_history;
    DROP TABLE IF EXISTS assessments;
    DROP TABLE IF EXISTS images;
    DROP TABLE IF EXISTS requests;
    PRAGMA foreign_keys = ON;
  `);
  db.exec(SCHEMA);
}
