# Task Status — Which Tree Falls First

Last updated: 2026-09-12

**Legend:** ✅ Done · 🟡 Partial · ⬜ Not started

| Phase | Task | Status |
|---|---|---|
| 0 | T1 Backend, database, storage | ✅ |
| 0 | T2 Seed data engineered for the demo | ✅ |
| 1 | T3 Resident submission flow | ✅ |
| 1 | T4 Location resolution | ✅ |
| 2 | T5 Image-aware severity pipeline | ✅ |
| 2 | T6 Duplicate detection | 🟡 |
| 3 | T7 Live admin queue | ✅ |
| 3 | T8 Same-day bundling | ⬜ |
| 3 | T9 Map view | ⬜ |
| 3 | T10 Lifecycle and completion | 🟡 |
| 4 | T11 Email and feedback | 🟡 |
| 5 | T12 Admin gate and abuse controls | ⬜ |

---

## Phase 0 — Foundation ✅

### T1 · Backend, database, storage ✅

Migrated from a client-only Vite SPA to Next.js 14 (App Router) so API routes,
pages, and file handling live in one app.

- SQLite via `better-sqlite3`, schema applied idempotently on first access
- Tables: `requests`, `images`, `assessments`, `status_history`, `feedback`
- Additive column migrations (`PRAGMA table_info` guard) so an existing database
  survives new columns
- Repository layer — every query lives there; nothing above it sees SQL
- Photo storage on disk **outside the web root**, served through
  `/api/images/[id]` so an auth check has somewhere to go
- Engine split into `classifyComplaint()` (persisted) and `scoreRequest()`
  (recomputed per read), because wait time changes daily and a stored final
  score would be wrong by morning

Files: `src/lib/db.ts`, `repository.ts`, `storage.ts`, `types.ts`,
`src/engine/scoring.ts`, `next.config.mjs`

### T2 · Seed data engineered for the demo ✅

28 records with **deliberate** spatial structure, plus a verification report
printed by `npm run db:reset`.

- Five clusters (North End, Quinpool, South End, Downtown) + one isolated outlier
- #1 ranked request sits in a tight cluster with **5 same-day candidates within
  500 m**, and those are *not* the next five in priority order
- #2 ranked request is **1.5 km away** — visibly unbundleable, exactly the case
  the brief describes
- One pre-linked duplicate pair, one unlinked near-duplicate pair
- Completed and rejected records, one with resident feedback
- All emails `@example.com`

Files: `src/seed/fixtures.ts`, `src/seed/run.ts`, `src/lib/geo.ts`

> Caught during this task: the first layout put #1 in a *spread-out* cluster with
> only one nearby candidate. The seeder's distance report exposed it and the
> geography was rebuilt.

---

## Phase 1 — Intake ✅

### T3 · Resident submission flow ✅

- Public `/report` form: name, email, location, description, optional photo
- Client-side preview via object URL (no base64 blowup on a 12 MB photo)
- Server validation with zod; field-level error display
- `POST /api/requests` accepts multipart, 12 MB cap, JPEG/PNG/WebP/HEIC
- Confirmation page at `/report/[reference]` with a reference number

**Deliberate choice:** the confirmation page shows **no risk score**. The ranking
is an internal dispatch decision; telling a resident their tree scored "Low"
reads as a safety judgement the tool is not making.

Files: `src/app/report/`, `src/components/ReportForm.tsx`,
`src/app/api/requests/route.ts`, `src/lib/intake.ts`

### T4 · Location resolution ✅

Four-step resolution, each falling back to the next:

1. **EXIF GPS** from the photo (`exifr`) — rejected unless plausibly in Halifax,
   so a holiday photo cannot poison the clustering
2. **Local Halifax gazetteer** — 28 streets, offline, street-centroid accuracy
3. **Live geocoder** — opt-in via `GEOCODER_URL`, off by default so a demo never
   depends on a third-party service
4. **Nothing** — stored anyway, flagged for a manual pin, excluded from distance
   maths

Files: `src/lib/geocode.ts`, `src/lib/exif.ts`

---

## Phase 2 — Intelligence

### T5 · Image-aware severity pipeline ✅

Photo analysis on the **same 0-100 scale and the same hazard vocabulary** the
text rules use, so fusion is arithmetic rather than translation.

Fusion policy (the interesting part):

| Situation | Score used | Review flag |
|---|---|---|
| No photo / analysis unavailable | text | unchanged |
| Photo and text agree (within 20) | higher of the two | unchanged |
| Photo shows **more** than described | photo | unchanged |
| Text claims **more** than the photo supports | text (the higher) | **flagged** |
| Photo resolves a vague description | photo | **cleared** |
| Photo unusable (not a tree, too dark) | text | **flagged** |

The fused score is never lower than the text score — under-ranking a described
hazard is the expensive mistake. Both source scores are shown side by side in
the admin UI so a disagreement is visible rather than averaged away.

Degrades cleanly: no API key, unsupported format, network failure or malformed
response all fall back to text-only. A submission never fails because an
analysis service was down.

Files: `src/lib/vision.ts`, `fuseClassification()` in `src/engine/scoring.ts`,
`src/components/PhotoAssessment.tsx`

### T6 · Duplicate detection 🟡

**Done:** scoring on three gated signals — proximity, recency, description
overlap (Jaccard over de-stopworded tokens). Weighted 30/20/50 toward
similarity, because a street-centroid geocode puts every address on a street at
the same point, so proximity alone would merge the whole street.
High-confidence matches are auto-linked at intake and drop out of the queue;
near-misses are returned as suggestions. Linked duplicates render on the detail
page.

**Remaining:**
- No admin UI to **confirm or reject** a suggested duplicate — suggestions are
  computed at intake and currently discarded rather than stored
- No unlink action for a wrong auto-link
- The seeded unlinked pair (`r-dup-windsor-a` / `-b`) is left as test material
  and is **not** yet detected retroactively — detection only runs on new intake

Files: `src/lib/duplicates.ts`, wired in `src/lib/intake.ts`

---

## Phase 3 — Admin operations

### T7 · Live admin queue ✅

Rebuilt on database reads. Summary cards, neighborhood/priority/review filters,
five sortable columns, empty state, mobile card layout, request detail with
scoring breakdown, hazard tags, status history, photos, and the printable
one-page poster.

Files: `src/app/admin/`, `src/components/QueueView.tsx`, `ComplaintTable.tsx`,
`FilterBar.tsx`, `RequestDetail.tsx`, `HazardPoster.tsx`

### T8 · Same-day bundling ⬜

Not started. Foundations exist: `distanceMeters()` in `src/lib/geo.ts`,
`estimatedHours` on every request, and seed geography built for it.

Needs: crew shift budget, a selection algorithm weighing severity *and* travel
*and* remaining hours together, and a recommendation panel on the selected job.

> Note: nearest-5 is the wrong objective. It would return five cosmetic jobs
> while a High-priority tree sits 400 m away.

### T9 · Map view ⬜

Not started. Currently a stylized SVG placeholder on the detail page. Bundling is
inherently spatial — a table cannot show why three jobs belong together.

### T10 · Lifecycle and completion 🟡

**Done:** full status enum (`Submitted → Triaged → Scheduled → In Progress →
Completed | Duplicate | Rejected`), `status_history` table with actor and note,
`setStatus()` writing row and history in one transaction so the audit trail can
never disagree with the row, `completed_at` handling, queue excludes closed
statuses, history rendered on the detail page.

**Remaining:** no UI. No "Mark complete" button, no status dropdown, no undo. The
whole server side is ready; this is a button and a server action.

### T11 · Email and feedback 🟡

**Done:** `feedback` table, feedback rendered on the detail page, seeded example,
resident email captured and stored, confirmation page promises the notification.

**Remaining:** no email is actually sent. Needs a transactional provider, two
templates (submission confirmation, completion notice), a feedback capture page
linked from the completion email, and delivery/bounce handling.

### T12 · Admin gate and abuse controls ⬜

Not started. `/admin` is currently open to anyone. Also needs rate limiting on
public submission and a moderation check folded into the vision pass.

---

## Current state

```bash
npm install
npm run db:reset   # seed + print the verification report
npm run dev        # http://localhost:5177
```

- `/report` — public submission
- `/admin` — inspection queue
- `/admin/requests/[id]` — assessment + printable poster

Production build passes; TypeScript clean. Runs with an empty environment — no
API key, no network required.

## Suggested next step

**T10's UI** is the cheapest meaningful win: the server side is already built, so
a "Mark complete" button closes the loop the brief asks for and makes T11's
completion email have something to fire on.

Then **T8**, which is the differentiating feature and the largest remaining
piece of work.
