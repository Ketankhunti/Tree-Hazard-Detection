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

import { closePool, dropAll, supabaseCount, supabaseFetch } from "@/backend/db/client";
import { distanceMeters, formatDistance } from "@/shared/geo";
import {
  insertFeedback,
  insertImage,
  insertRequest,
  listOpenRequests,
  recordStatusChange,
  saveClassification,
} from "@/backend/db/repository";
import {
  filenameFor,
  newImageId,
} from "@/backend/services/storage";
import { classifyComplaint } from "@/backend/domain/scoring";
import {
  PLACEHOLDER_MIME,
  placeholderPhotoSvg,
} from "@/backend/seed/placeholder-photo";
import type { RequestStatus } from "@/shared/types";
import { fixtures, type Fixture } from "@/backend/seed/fixtures";

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setHours(11, 30, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

async function seedOne(fixture: Fixture): Promise<void> {
  const submittedAt = isoDaysAgo(fixture.daysAgo);
  const completedAt =
    fixture.completedDaysAgo !== undefined
      ? isoDaysAgo(fixture.completedDaysAgo)
      : null;

  await insertRequest({
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
  await saveClassification(fixture.id, classifyComplaint(fixture.description));

  // Every request starts life as Submitted; replay how it reached its status.
  await recordStatusChange({
    requestId: fixture.id,
    fromStatus: null,
    toStatus: "Submitted",
    actor: fixture.reporterName,
    note: "Submitted via public form",
    createdAt: submittedAt,
  });

  if (fixture.status !== "Submitted") {
    await recordStatusChange({
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
    const body = Buffer.from(
      placeholderPhotoSvg({
        reference: fixture.reference,
        address: fixture.address,
        muted: fixture.status === "Completed",
      }),
      "utf8"
    );
    await insertImage({
      id: imageId,
      requestId: fixture.id,
      filename,
      mimeType: PLACEHOLDER_MIME,
      byteSize: body.byteLength,
      data: body.toString("base64"),
      exifLatitude: fixture.locationSource === "exif" ? fixture.latitude : null,
      exifLongitude: fixture.locationSource === "exif" ? fixture.longitude : null,
    });
  }

  if (fixture.feedback) {
    await insertFeedback({
      requestId: fixture.id,
      rating: fixture.feedback.rating,
      comment: fixture.feedback.comment,
    });
  }
}

async function report(): Promise<void> {
  const queue = await listOpenRequests();

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

  if (reset) {
    console.log("Dropping all tables...");
    await dropAll();
  }

  const existing = await supabaseCount("requests");

  if (existing > 0 && !reset) {
    console.log(
      `Database already holds ${existing} requests. Use "npm run db:reset" to rebuild.`
    );
    await report();
    return;
  }

  // One transaction would be nicer, but image writes are async; the seeder is
  // a dev-only script and a partial run is fixed by re-running with --reset.
  for (const fixture of fixtures) {
    // Duplicates reference another request, so insert primaries first.
    if (!fixture.duplicateOf) await seedOne(fixture);
  }
  for (const fixture of fixtures) {
    if (fixture.duplicateOf) await seedOne(fixture);
  }

  // Count by status: fetch all statuses and count in JS (PostgREST has no GROUP BY)
  const statusRows = await supabaseFetch<{ status: string }[]>("requests", "GET", undefined, {
    select: "status",
    limit: 10000,
  });
  const statusCounts: Record<string, number> = {};
  if (statusRows) {
    for (const row of statusRows) {
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    }
  }

  console.log(`\nSeeded ${fixtures.length} requests:`);
  for (const [status, n] of Object.entries(statusCounts).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${status.padEnd(14)} ${n}`);
  }

  const imageCount = await supabaseCount("images");
  console.log(`  ${"photos".padEnd(14)} ${imageCount}`);

  await report();
}

main()
  .then(() => closePool())
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
