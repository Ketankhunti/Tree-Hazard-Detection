import { createHmac, timingSafeEqual } from "node:crypto";

import { config } from "@/backend/config";
import type { Point } from "@/shared/geo";
import {
  BUNDLE_MAP,
  LOCATION_MAP,
  fitViewport,
  hasCoordinates,
  pointViewport,
} from "@/shared/map";
import type { MapViewport, StaticMapImage } from "@/shared/map";

/**
 * Google Static Maps, proxied.
 *
 * The API key is server-only (see config.ts), so the browser cannot call Google
 * directly. Instead the server hands the client a URL on our own origin and
 * `/api/map` fetches the raster with the key attached.
 *
 * A proxy that accepts arbitrary coordinates is a free image service billed to
 * HRM, so each URL is signed: the route renders nothing it did not itself
 * generate. Requests are otherwise unauthenticated on purpose - a signed map
 * has to load inside a printed poster and an <img> tag, neither of which can
 * carry a header.
 */

const GOOGLE_STATIC_MAPS = "https://maps.googleapis.com/maps/api/staticmap";

/** Retina output. Costs the same request; halves the apparent pixellation. */
const IMAGE_SCALE = 2;

/** Static Maps rejects anything larger per request. */
const MAX_DIMENSION = 640;

/**
 * Restrained basemap matching the panel palette: white roads, slate land,
 * business POIs and transit removed. Parks keep their fill - a tree crew
 * navigating by canopy needs to see green space.
 */
const MAP_STYLES = [
  "feature:poi.business|visibility:off",
  "feature:poi.attraction|visibility:off",
  "feature:transit|visibility:off",
  "feature:administrative.land_parcel|visibility:off",
  "feature:landscape|element:geometry|color:0xf1f5f9",
  "feature:poi.park|element:geometry|color:0xdcfce7",
  "feature:water|element:geometry|color:0xdbeafe",
  "feature:road|element:geometry.fill|color:0xffffff",
  "feature:road|element:geometry.stroke|color:0xdfe5ec",
  "feature:road.highway|element:geometry.fill|color:0xfef9e7",
  "feature:all|element:labels.icon|visibility:off",
];

/**
 * HMAC secret. Falls back to the API key itself, which is already a
 * high-entropy server-only secret - one less variable to set for a value that
 * never leaves the process.
 */
function signingSecret(): string | null {
  if (!config.googleMapsApiKey) return null;
  return config.mapProxySecret ?? config.googleMapsApiKey;
}

/**
 * Query string in a fixed order, coordinates at a fixed precision. Both sides
 * must produce byte-identical input or the signature will not match.
 */
function canonicalParams(viewport: MapViewport): string {
  const at = `${viewport.centerLat.toFixed(6)},${viewport.centerLng.toFixed(6)}`;
  return `at=${at}&z=${viewport.zoom}&w=${viewport.width}&h=${viewport.height}`;
}

function sign(canonical: string, secret: string): string {
  // 96 bits is far more than enough to stop URL fiddling and keeps the query short.
  return createHmac("sha256", secret).update(canonical).digest("hex").slice(0, 24);
}

/** Signed URL on our own origin, or null when no key is configured. */
export function staticMapImage(viewport: MapViewport | null): StaticMapImage | null {
  const secret = signingSecret();
  if (!viewport || !secret) return null;

  const canonical = canonicalParams(viewport);
  return {
    src: `/api/map?${canonical}&sig=${sign(canonical, secret)}`,
    viewport,
  };
}

/** Operations basemap fitted to the anchor and its recommended jobs. */
export function bundleMapImage(points: Point[]): StaticMapImage | null {
  return staticMapImage(fitViewport(points, BUNDLE_MAP));
}

/** Locator basemap for a single request. */
export function locationMapImage(point: Point): StaticMapImage | null {
  if (!hasCoordinates(point)) return null;
  return staticMapImage(pointViewport(point, LOCATION_MAP));
}

/**
 * Validates and authenticates an incoming `/api/map` query.
 *
 * Returns the viewport to render, or a reason to refuse. The dimension and zoom
 * bounds are redundant given a valid signature, but they mean a bug upstream
 * produces a 400 here instead of a rejected request billed to the project.
 */
export function readSignedViewport(
  params: URLSearchParams
): { viewport: MapViewport } | { error: string; status: number } {
  const secret = signingSecret();
  if (!secret) return { error: "Map imagery is not configured", status: 404 };

  const [latText, lngText] = (params.get("at") ?? "").split(",");
  const centerLat = Number(latText);
  const centerLng = Number(lngText);
  const zoom = Number(params.get("z"));
  const width = Number(params.get("w"));
  const height = Number(params.get("h"));

  const finite = [centerLat, centerLng, zoom, width, height].every(Number.isFinite);
  const inRange =
    Math.abs(centerLat) <= 85 &&
    Math.abs(centerLng) <= 180 &&
    Number.isInteger(zoom) &&
    zoom >= 8 &&
    zoom <= 20 &&
    width >= 64 &&
    width <= MAX_DIMENSION &&
    height >= 64 &&
    height <= MAX_DIMENSION;
  if (!finite || !inRange) return { error: "Invalid map viewport", status: 400 };

  const viewport: MapViewport = { centerLat, centerLng, zoom, width, height };
  const expected = Buffer.from(sign(canonicalParams(viewport), secret));
  const provided = Buffer.from(params.get("sig") ?? "");
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return { error: "Invalid map signature", status: 403 };
  }

  return { viewport };
}

/** The upstream Google request. Only ever built inside the route handler. */
export function googleStaticMapUrl(viewport: MapViewport): string {
  const url = new URL(GOOGLE_STATIC_MAPS);
  url.searchParams.set("center", `${viewport.centerLat},${viewport.centerLng}`);
  url.searchParams.set("zoom", String(viewport.zoom));
  url.searchParams.set("size", `${viewport.width}x${viewport.height}`);
  url.searchParams.set("scale", String(IMAGE_SCALE));
  url.searchParams.set("maptype", "roadmap");
  url.searchParams.set("format", "png");
  url.searchParams.set("language", "en-CA");
  url.searchParams.set("region", "ca");
  for (const style of MAP_STYLES) url.searchParams.append("style", style);
  url.searchParams.set("key", config.googleMapsApiKey ?? "");
  return url.toString();
}
