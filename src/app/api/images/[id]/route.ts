import { NextResponse } from "next/server";

import { getImage } from "@/backend/db/repository";
import { readImage } from "@/backend/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a complaint photo by image id.
 *
 * Photos live outside the web root so this handler stays in front of them -
 * the place an authorization check goes once the admin console is gated.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const image = getImage(params.id);
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const bytes = await readImage(image.filename);
  if (!bytes) {
    return NextResponse.json(
      { error: "Image record exists but the file is missing" },
      { status: 410 }
    );
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
