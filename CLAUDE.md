# Which Tree Falls First — Halifax Urban Forestry

Inspection triage for HRM Urban Forestry. ~290 tree requests are open; crews
reach a handful a week. Residents report trees through a public form; the system
reads the description and photo, scores the hazard, ranks the backlog, and
suggests what else a crew can clear on the same trip.

**The tool decides inspection ORDER. It never decides whether a tree is
dangerous.** Every user-facing surface must preserve that distinction — it is a
product requirement, not a disclaimer.

## Commands

```bash
npm install
cp .env.example .env.local   # DATABASE_URL is required (Supabase)
npm run db:reset   # drop, recreate, seed, and print a verification report
npm run dev        # http://localhost:5177
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm test           # vitest (scoring engine)
npm run db:seed    # seed without wiping; no-op if already seeded
```

`DATABASE_URL` (Supabase Postgres) is the **only required** variable. Everything
else — photo analysis, geocoding — is optional and degrades to a local fallback.
Keep it that way: a missing API key must never fail a resident's submission.

## Layer structure

```
src/
  backend/     server-only. Never imported by anything under frontend/.
    config.ts            env reading; all values optional
    db/client.ts         Postgres pool, schema, migrations, transactions
    db/repository.ts     every query; snake_case in, camelCase out
    domain/scoring.ts    hazard rules, classification, fusion, escalation
    domain/bundling.ts   same-day work planner
    domain/duplicates.ts same-tree detection
    services/            intake, vision, geocode, staticmap, auth, exif, storage
    seed/                fixtures + seeder (dev tooling)
  shared/      safe in both bundles. Pure data and helpers, no I/O.
    types.ts             domain types, incl. the server->client prop shapes
    scoring-config.ts    WEIGHTS, priority bands — the displayed contract
    geo.ts               distance maths and formatting
    map.ts               Web Mercator projection for the basemap overlay
  frontend/    React only.
    components/
    styles/globals.css
  app/         Next.js routing only. Pages compose; they do not hold logic.
  middleware.ts          the /admin gate — covers pages AND server actions
```

**Routes.** `/` is the resident form and is public. Everything under `/admin` is
behind the staff sign-in at `/admin/login`. `/report/<reference>` is the resident
confirmation page and stays public — a resident has no account.

**The one rule:** `frontend/` must never import from `backend/`. If a component
needs a value the engine owns, that value belongs in `shared/`. This is why
`WEIGHTS` and `BundlePlan` live in `shared` — the UI prints them.

`backend/` may import `shared/`. `shared/` imports nothing from either side.

## Architectural invariants

**Classification is persisted; scoring is not.**

```
classifyComplaint(text) -> Classification   expensive, runs once, STORED
scoreRequest(cls, ctx)  -> Assessment       cheap, recomputed EVERY READ
```

Wait time changes daily, so a final score written to the database would be wrong
by morning. Only findings derived from the complaint and photo are stored. Never
add `final_score` as a column.

**Queue ordering happens in JS, not SQL**, for the same reason.

**All text/image understanding sits behind two functions** —
`classifyComplaint()` and `analyzeImage()`. Swapping either for a different
model must not require touching the weighting, thresholds, reasoning, or UI.

## Scoring

```
finalScore = danger*0.50 + wait*0.25 + location*0.15 + review*0.10
```

Bands: Critical 80-100, High 60-79, Medium 35-59, Low 0-34.

**The imminent-hazard escalation floor.** The weighted formula alone cannot
express urgency for a new report: a tree actively falling onto a house, reported
today on a residential street, tops out at 56 → "Medium". Backlog age would
outrank an active hazard. So danger sets a *floor* — danger ≥70 floors at 80,
danger ≥50 floors at 60. It never lowers a score and never alters the four
component scores. When it binds, the UI and the poster say so and show the
pre-escalation weighted score.

**"Unsure" is not "dangerous."** The review flag means the system lacks
information, not that the tree is safe or hazardous. Priority is computed
independently; the two are always displayed side by side, never substituted.

**Photo/text fusion.** Both produce a 0-100 severity on the same hazard
vocabulary, so fusion is arithmetic. The fused score is never *lower* than the
text score — under-ranking a described hazard is the expensive mistake. Text
claiming more than the photo supports keeps the higher score but is flagged; a
photo that resolves a vague description clears the flag.

**Bundling is not "the five nearest."** Nearest-five returns five cosmetic
prunings while a High-priority tree sits 400m away. Ranking is severity earned
per hour of shift consumed, discounted by a 400m-half-life proximity factor.
Because a Critical removal is 5-6h of an 8h shift, the planner reports two
groups: what fits today, and the follow-up trip.

## Maps and location

**The Google Maps key is server-only.** It drives the Geocoding API and the Maps
Static API. Never expose it with a `NEXT_PUBLIC_` prefix: basemap rasters reach
the browser through `/api/map`, which attaches the key server-side. Every URL that
route accepts is HMAC-signed, so the proxy cannot be turned into free image
hosting billed to HRM.

**Google draws the streets; we draw the markers.** Priority colour, driving order
and today-vs-follow-up are the reason the map exists, and Google's marker
parameters cannot express them. That split only works because `shared/map.ts`
reproduces Google's Web Mercator projection exactly — the same viewport builds
the image URL on the server and the pixel positions on the client. `map.test.ts`
pins it against great-circle distance; a drift here moves pins to the wrong block
while still looking plausible.

**An `APPROXIMATE` geocode is discarded, not stored.** It is a locality centroid,
so every address Google cannot recognise resolves to the same downtown point.
Keeping those would stack unrelated reports inside the 90 m duplicate radius and
merge them into one tree. Fall through to the gazetteer, or to no coordinates at
all and a manual pin.

## Access

`/` is public; `/admin` is not. The gate is `src/middleware.ts`, not a per-page
check, because status changes POST back to the same routes — a page-level guard
would leave the server actions reachable. One shared staff account
(`ADMIN_USERNAME` / `ADMIN_PASSWORD`, default `admin` / `admin`) and an
HMAC-signed cookie that expires after a shift; no session store, so nothing
breaks when the app runs on more than one instance.

Reporting a hazard must never require an account. Keep the resident form and the
`/report/<reference>` confirmation outside the matcher.

## Conventions

- Comments explain **why**, not what. Non-obvious tradeoffs get a short note;
  obvious code gets none.
- Government-tool visual language: white, light grey panels, subtle borders,
  restrained colour, data-dense, square corners. No gradients, no heavy shadows,
  no generic SaaS look.
- Priority colours are fixed: Critical red, High orange, Medium amber, Low grey,
  Unsure purple.
- Seeded emails are always `@example.com`. Nothing in fixtures may reach a real
  inbox.
- Every external call (vision, geocoding) must have a local fallback and must
  never fail a resident's submission.

## Print

`.no-print` wraps the entire app; the poster sits outside it. In print,
`.no-print { display: none }` leaves only the one-page sheet. `@page` is US
Letter portrait, 0.5in margins; the poster is 7.5in wide and must stay inside
10in of height. Do not wrap the poster in a `.no-print` ancestor.

## Gotchas

- **Database is Supabase Postgres via `pg`.** Every repository function is
  `async` — a forgotten `await` yields a Promise that renders as `[object
  Promise]` rather than throwing.
- **jsonb parameters must be `JSON.stringify`'d.** node-postgres converts a JS
  array into a Postgres array literal, which jsonb rejects. `hazards` is an
  array, so this bites immediately.
- **jsonb results come back parsed.** Never `JSON.parse` them.
- **`COUNT(*)` returns a string** (bigint). Use `toCount()`.
- **`TIMESTAMPTZ` returns a `Date`**, not a string. `toIso()` normalises.
- **Never put `sslmode=require` in DATABASE_URL.** pg >= 8.23 treats it as
  `verify-full`, and a connection-string SSL mode overrides the `ssl` option
  object - every connection then dies with "self-signed certificate in
  certificate chain". `connectionSettings()` strips it deliberately.
- **The direct host (`db.<ref>.supabase.co`) is IPv6-only.** On an IPv4-only
  network it fails with ENOTFOUND, which looks like a wrong project ref but
  is not. Use the **Session pooler** (`aws-0-<region>.pooler.supabase.com:5432`,
  user `postgres.<ref>`). The Transaction pooler (6543) is for serverless only.
- `npm run db:check` diagnoses all of the above and will auto-discover the
  pooler region if the direct host is unreachable.
- **`tsx` does not read `.env.local`.** The db scripts pass
  `--env-file=.env.local` explicitly; Next loads it on its own.
- Server actions cannot receive functions as props. Pass plain records
  (this is why the queue rank map crosses the boundary as `Record<string, number>`).
- `server-only` throws under plain `tsx`, which breaks the seeder. The layer
  rule is enforced by convention and review, not by that package.
- The SDK's zod output helper tracks zod v4 while the app uses v3 for form
  validation; vision uses `jsonSchemaOutputFormat` with a raw JSON Schema.
- Seed geography is **deliberate**, not random. `npm run db:reset` prints the
  distances. If a change makes the #1 request lose its nearby cluster, the
  bundling demo breaks — that report is the guard.

## Status

See `task.md` for per-task status. Done: T1-T5, T7-T10. Partial: T6 (no admin UI
to confirm/reject suggested duplicates), T11 (feedback stored, no email sent),
T12 (`/admin` is gated; still no rate limiting on public submission, no
moderation pass, and `/api/images` is unauthenticated because the resident
confirmation page needs it).
