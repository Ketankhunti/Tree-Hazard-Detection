import { NextResponse } from "next/server";

import { getImage, getRequest } from "@/backend/db/repository";
import { PLACEHOLDER_MIME, placeholderPhotoSvg } from "@/backend/seed/placeholder-photo";
import { readImage, writeImage } from "@/backend/services/storage";
import { CLOSED_STATUSES } from "@/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a complaint photo by image id.
 *
 * Photos live outside the web root. When the database was seeded on Supabase but
 * `var/uploads` was never populated locally (or was wiped), seeded SVG
 * placeholders are regenerated on first request and written back to disk.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const image = await getImage(params.id);
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  let bytes = await readImage(image.filename);

  if (!bytes && image.mimeType === PLACEHOLDER_MIME) {
    const request = await getRequest(image.requestId);
    if (request) {
      bytes = Buffer.from(
        placeholderPhotoSvg({
          reference: request.reference,
          address: request.address,
          muted: (CLOSED_STATUSES as string[]).includes(request.status),
        }),
        "utf8"
      );
      await writeImage(image.filename, bytes);
    }
  }

  if (!bytes) {
    return NextResponse.json(
      { error: "Image record exists but the file is missing" },
      { status: 410 }
    );
  }

  const contentType =
    image.mimeType === PLACEHOLDER_MIME
      ? `${PLACEHOLDER_MIME}; charset=utf-8`
      : image.mimeType;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
