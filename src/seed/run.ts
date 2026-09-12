/**
 * Seeds the database.
 *
 *   npm run db:seed    insert fixtures (skips if already seeded)
 *   npm run db:reset   drop everything and re-seed
 *
 * Besides inserting rows, this prints a verification report: the ranked queue,
 * and the actual great-circle distances from the #1 request to everything else.
 * If the "engineered clusters" claim in fixtures.ts ever stops being true, that
 * report is where it shows up.
 */

import { dropAll, getDb } from "../lib/db";
import { distanceMeters, formatDistance } from "../lib/geo";
import {
  insertFeedback,
  insertImage,
  insertRequest,
  listOpenRequests,
  recordStatusChange,
  saveClassification,
} from "../lib/repository";
import {
  ensureUploadDir,
  filenameFor,
  newImageId,
  writeImage,
} from "../lib/storage";
import { classifyComplaint } from "../engine/scoring";
import type { RequestStatus } from "../lib/types";
import { fixtures, type Fixture } from "./fixtures";

const PLACEHOLDER_MIME = "image/svg+xml";

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setHours(11, 30, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

/**
 * Stand-in for a resident's photo.
 *
 * Real JPEGs would be better, and the demo should use them - drop files into
 * `seed-photos/<fixture-id>.jpg` and extend this to read them. Until then a
 * generated SVG exercises the full upload -> storage -> serve path, which is
 * what Phase 0 needs to prove.
 */
function placeholderSvg(fixture: Fixture): string {
  const tone =
    fixture.status === "Completed" ? "#64748b" : "#3f6212";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#e2e8f0"/>
  <rect x="0" y="430" width="800" height="170" fill="#cbd5e1"/>
  <rect x="360" y="240" width="46" height="210" fill="#78716c"/>
  <circle cx="383" cy="210" r="118" fill="${tone}" opacity="0.85"/>
  <circle cx="300" cy="250" r="78" fill="${tone}" opacity="0.7"/>
  <circle cx="470" cy="252" r="84" fill="${tone}" opacity="0.75"/>
  <text x="400" y="527" font-family="monospace" font-size="26" fill="#475569" text-anchor="middle">${fixture.reference}</text>
  <text x="400" y="561" font-family="sans-serif" font-size="20" fill="#64748b" text-anchor="middle">${fixture.address}</text>
  <text x="400" y="586" font-family="sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">placeholder - no field photo supplied</text>
</svg>`;
}

async function seedOne(fixture: Fixture): Promise<void> {
  const submittedAt = isoDaysAgo(fixture.daysAgo);
  const completedAt =
    fixture.completedDaysAgo !== undefined
      ? isoDaysAgo(fixture.completedDaysAgo)
      : null;

  insertRequest({
    id: fixture.id,
    reference: fixture.reference,
    reporterName: fixture.reporterName,
    reporterEmail: fixture.reporterEmail,
    address: fixture.address,
    street: fixture.street,
    neighborhood: fixture.neighborhood,
    latitude: fixture.latitude,
    longitude: fixture.longitude,
    locationSource: fixture.locationSource,
    description: fixture.description,
    submittedAt,
    status: fixture.status,
    duplicateOfId: fixture.duplicateOf ?? null,
    estimatedHours: fixture.estimatedHours,
    completedAt,
  });

  // Classify once, exactly as the intake route will when a resident submits.
  saveClassification(fixture.id, classifyComplaint(fixture.description));

  // Every request starts life as Submitted; replay how it reached its status.
  recordStatusChange({
    requestId: fixture.id,
    fromStatus: null,
    toStatus: "Submitted",
    actor: fixture.reporterName,
    note: "Submitted via public form",
    createdAt: submittedAt,
  });

  if (fixture.status !== "Submitted") {
    recordStatusChange({
      requestId: fixture.id,
      fromStatus: "Submitted",
      toStatus: fixture.status as RequestStatus,
      actor: "seed",
      note: "Backfilled by seeder",
      createdAt: completedAt ?? submittedAt,
    });
  }

  if (fixture.photo) {
    const imageId = newImageId();
    const filename = filenameFor(imageId, PLACEHOLDER_MIME);
    const body = Buffer.from(placeholderSvg(fixture), "utf8");
    await writeImage(filename, body);
    insertImage({
      id: imageId,
      requestId: fixture.id,
      filename,
      mimeType: PLACEHOLDER_MIME,
      byteSize: body.byteLength,
      exifLatitude: fixture.locationSource === "exif" ? fixture.latitude : null,
      exifLongitude: fixture.locationSource === "exif" ? fixture.longitude : null,
    });
  }

  if (fixture.feedback) {
    insertFeedback({
      requestId: fixture.id,
      rating: fixture.feedback.rating,
      comment: fixture.feedback.comment,
    });
  }
}

function report(): void {
  const queue = listOpenRequests();

  console.log("\nRanked queue (open requests only)");
  console.log("-".repeat(78));
  queue.forEach((request, index) => {
    const a = request.assessment;
    console.log(
      [
        String(index + 1).padStart(2, "0"),
        String(a.finalScore).padStart(3),
        a.priority.padEnd(8),
        (a.reviewStatus === "Unsure" ? "UNSURE" : "").padEnd(6),
        `${request.daysWaiting}d`.padStart(5),
        request.address.padEnd(28),
        request.neighborhood,
      ].join("  ")
    );
  });

  const top = queue[0];
  if (!top) return;

  console.log(`\nDistance from #1 (${top.address})`);
  console.log("-".repeat(78));
  const neighbours = queue
    .slice(1)
    .map((request) => ({
      request,
      meters: distanceMeters(top, request),
    }))
    .filter((entry): entry is { request: typeof top; meters: number } =>
      entry.meters !== null
    )
    .sort((a, b) => a.meters - b.meters);

  for (const { request, meters } of neighbours) {
    const rank = queue.indexOf(request) + 1;
    const bundleable = meters <= 500 ? "  <- same-day candidate" : "";
    console.log(
      [
        `#${String(rank).padStart(2, "0")}`,
        formatDistance(meters).padStart(8),
        request.assessment.priority.padEnd(8),
        request.address.padEnd(28),
      ].join("  ") + bundleable
    );
  }

  const near = neighbours.filter((entry) => entry.meters <= 500);
  const second = queue[1];
  const secondDistance = distanceMeters(top, second);

  console.log("\nDemo scenario check");
  console.log("-".repeat(78));
  console.log(`  #1 is ${top.address} (${top.assessment.priority})`);
  console.log(
    `  #2 is ${second.address} - ${
      secondDistance === null ? "no coordinates" : formatDistance(secondDistance)
    } away${secondDistance !== null && secondDistance > 1000 ? "  (too far to bundle - as designed)" : ""}`
  );
  console.log(
    `  ${near.length} request(s) within 500 m of #1 available for same-day bundling`
  );
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");
  const db = getDb();

  if (reset) {
    console.log("Dropping all tables...");
    dropAll(db);
  }

  const existing = db
    .prepare("SELECT COUNT(*) AS n FROM requests")
    .get() as { n: number };

  if (existing.n > 0 && !reset) {
    console.log(
      `Database already holds ${existing.n} requests. Use "npm run db:reset" to rebuild.`
    );
    report();
    return;
  }

  ensureUploadDir();

  // One transaction would be nicer, but image writes are async; the seeder is
  // a dev-only script and a partial run is fixed by re-running with --reset.
  for (const fixture of fixtures) {
    // Duplicates reference another request, so insert primaries first.
    if (!fixture.duplicateOf) await seedOne(fixture);
  }
  for (const fixture of fixtures) {
    if (fixture.duplicateOf) await seedOne(fixture);
  }

  const counts = db
    .prepare("SELECT status, COUNT(*) AS n FROM requests GROUP BY status")
    .all() as Array<{ status: string; n: number }>;

  console.log(`\nSeeded ${fixtures.length} requests:`);
  for (const row of counts) console.log(`  ${row.status.padEnd(14)} ${row.n}`);

  const images = db.prepare("SELECT COUNT(*) AS n FROM images").get() as {
    n: number;
  };
  console.log(`  ${"photos".padEnd(14)} ${images.n}`);

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
