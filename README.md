# Which Tree Falls First

Inspection triage for Halifax Regional Municipality Urban Forestry.

290 tree requests are open. Every one needs a site visit, and crews reach only a
handful a week. Residents report trees through a public form; the system reads
the description and the photo, scores the hazard, and ranks the backlog so the
most dangerous trees are inspected first.

It does **not** decide whether a tree is dangerous. It decides what order a
qualified arborist should look at them in.

## Run it

```bash
npm install
npm run db:reset   # create the database and seed it
npm run dev        # http://localhost:5177
```

- `/report` — public submission form (no login)
- `/admin` — inspection queue
- `/admin/requests/[id]` — full assessment and printable poster

No API key is required. Photo analysis is skipped when one is absent and the
app falls back to text-only triage.

```bash
npm run build      # production build
npm run db:seed    # seed without wiping (no-op if already seeded)
npm test           # scoring-engine tests
```

## Configuration

Everything is optional — copy `.env.example` to `.env.local` to change any of it.

| Variable | Default | Effect |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Enables photo analysis. Without it, text-only. |
| `VISION_MODEL` | `claude-opus-5` | Model used to assess photos. |
| `GEOCODER_URL` | unset | Opt-in live geocoding. Off by default so a demo never depends on a third-party service. |
| `DATABASE_PATH` | `var/app.db` | SQLite file. |
| `UPLOAD_DIR` | `var/uploads` | Photo storage, outside the web root. |

## Architecture

```
src/
  app/
    report/                 public submission + confirmation
    admin/                  inspection queue + request detail
    api/requests/           intake endpoint (multipart, optional photo)
    api/images/[id]/        photo serving
  engine/scoring.ts         pure scoring engine - no React, no I/O
  lib/
    db.ts                   SQLite schema + additive migrations
    repository.ts           every query; snake_case in, camelCase out
    intake.ts               the submission pipeline
    vision.ts               photo analysis
    geocode.ts              address -> coordinates
    exif.ts                 photo GPS extraction
    duplicates.ts           same-tree detection
    geo.ts                  distance maths
    storage.ts              photo files on disk
  seed/                     engineered demo dataset
  components/               UI
```

### Classification is stored; scoring is not

```
classifyComplaint(text) -> Classification   expensive, runs once, PERSISTED
scoreRequest(cls, ctx)  -> Assessment       cheap, recomputed EVERY READ
```

Wait time changes daily, so a final score written to the database would be wrong
by the next morning. Only findings derived from the complaint and the photo are
stored; the weighting, escalation and priority are always live.

### How the score works

```
finalScore = danger * 0.50 + wait * 0.25 + location * 0.15 + review * 0.10
```

| Component | Weight | Source |
|---|---|---|
| Danger | 50% | Text rules fused with photo analysis, capped at 100 |
| Wait time | 25% | `min(daysWaiting / 180 * 100, 100)` |
| Location impact | 15% | Per-street table; major arterials score highest |
| Human review | 10% | 100 when the report is too vague or ambiguous to triage |

Priority bands: **Critical** 80-100, **High** 60-79, **Medium** 35-59, **Low** 0-34.

### The imminent-hazard escalation floor

The weighted formula alone cannot express urgency for a brand-new report. A tree
actively falling onto a house, reported today on a residential street, tops out at:

```
danger 100*0.50 + wait 0*0.25 + location 40*0.15 + review 0*0.10 = 56  ->  "Medium"
```

Backlog age would outrank an active hazard, which is the wrong answer to the
question this tool exists to answer. So danger sets a **floor** on the final
score, the way severity rows work in a municipal risk matrix:

- danger >= 70 -> floor of 80 (Critical)
- danger >= 50 -> floor of 60 (High)

The floor never lowers a score and never alters the four component scores. When
it binds, the UI and the printed poster both say so and show the pre-escalation
weighted score.

### Fusing photo and description

The photo is analyzed on the same 0-100 scale and the same hazard vocabulary the
text rules use, so fusion is arithmetic rather than translation. The policy:

| Situation | Score used | Review flag |
|---|---|---|
| No photo, or analysis unavailable | text | unchanged |
| Photo and text agree (within 20) | higher of the two | unchanged |
| Photo shows **more** than described | photo | unchanged |
| Text claims **more** than the photo supports | text (the higher) | **flagged** |
| Photo resolves a vague description | photo | **cleared** |
| Photo unusable (not a tree, too dark) | text | **flagged** |

The fused score is never lower than the text score: under-ranking a hazard
someone described is the expensive mistake. Both source scores are always shown
side by side in the admin UI, so a disagreement is visible rather than averaged
away.

### "Unsure" is not "dangerous"

A report is flagged for human review when nothing observable can be scored. That
raises the review component and shows a purple badge, but priority is computed
independently — a vague report stays Low if nothing else is elevated. The two are
displayed side by side, never substituted for one another.

### Same-tree detection

When a large tree comes down, a dozen neighbours report it. Left alone that fills
the top of the queue with one tree. Three signals gate a merge — proximity,
recency, and description overlap — because no single one is sufficient: a
street-centroid geocode puts every address on a street at the same point, so
proximity alone would merge the whole street. High-confidence matches are linked
automatically and drop out of the queue; anything below the bar is surfaced as a
suggestion for a human.

### Location resolution

1. **EXIF GPS** from the photo — the phone was actually there
2. **Local Halifax gazetteer** — offline, street-centroid accuracy
3. **Live geocoder** — opt-in via `GEOCODER_URL`
4. **Nothing** — stored anyway, flagged for a manual pin, excluded from distance maths

## Swapping the classifier

All text understanding is behind one function: `classifyComplaint()` in
`src/engine/scoring.ts`. Replace it with a model call returning the same
`Classification` shape and the weighting, thresholds, reasoning, UI and poster
keep working unchanged.

## Printing

"Print Poster" calls `window.print()`. Everything except the poster sits inside
`.no-print`, which is `display: none` in print, so only the one-page assessment
sheet reaches the printer. `@page` is US Letter portrait with 0.5in margins; the
poster measures 7.5in wide and fits inside the 10in printable height.

## Seed data

The demo dataset is engineered, not random. `npm run db:reset` prints a
verification report showing the ranked queue and the real distances between
requests. It deliberately contains:

- Five geographic clusters plus one isolated outlier
- The **#1 ranked request inside a tight cluster**, with five same-day
  candidates within 500 m — and those candidates are *not* the next five in
  priority order
- The **#2 ranked request 1.5 km away**, so it visibly cannot be bundled with #1
- A pre-linked duplicate pair, and an unlinked near-duplicate pair
- Completed and rejected records, one with resident feedback

All seeded emails are `@example.com`. Nothing in the dataset can reach a real
inbox.
