import { NextResponse } from "next/server";

import {
  googleStaticMapUrl,
  readSignedViewport,
} from "@/backend/services/staticmap";

export const runtime = "nodejs";

/**
 * Google Static Maps basemap for a signed viewport.
 *
 * Exists so the API key stays on the server: the client only ever sees a URL on
 * our own origin. See src/backend/services/staticmap.ts for the signing scheme.
 *
 * A failed fetch returns 502 rather than an error image - the map components
 * fall back to their offline plot, so a Google outage costs the streets on the
 * basemap and nothing else.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const resolved = readSignedViewport(params);

  if ("error" in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(googleStaticMapUrl(resolved.viewport), {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Map service unreachable" }, { status: 502 });
  }

  if (!upstream.ok) {
    // Google returns the reason as plain text; it names the missing API or the
    // referrer restriction, which is the only useful thing to log here.
    console.error(
      `[map] Google Static Maps HTTP ${upstream.status}: ${(await upstream.text()).slice(0, 200)}`
    );
    return NextResponse.json({ error: "Map service error" }, { status: 502 });
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      // A signed viewport always renders the same tiles, so this is safe to hold
      // for a long time. It is also what keeps repeated page views off the meter.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
