/**
 * Web Mercator maths for the Google Static Maps basemap.
 *
 * The operations map draws its own markers on top of a Google raster: priority
 * colours, driving order and the follow-up ring carry meaning that Google's
 * marker vocabulary cannot express. That only works if this file reproduces the
 * exact projection the tile server used, so a pin lands on the right street
 * rather than a block over.
 *
 * Pure maths, no I/O - the server builds the image URL from a viewport and the
 * client projects the same viewport back into pixels.
 */

import type { Point } from "./geo";

/** Google serves 256px tiles; the whole world is one tile at zoom 0. */
const TILE_SIZE = 256;

/** Metres per pixel at the equator, zoom 0. */
const EQUATOR_METERS_PER_PIXEL = 156_543.03392;

/**
 * Static Maps only accepts integer zoom, so a fitted view can leave up to 2x
 * slack. Clamping the range keeps that from degenerating into either a
 * street-corner crop or a view of the whole province.
 */
const MIN_ZOOM = 11;
const MAX_ZOOM = 18;

/** Used when every point sits at the same spot and there is no span to fit. */
const SINGLE_POINT_ZOOM = 16;

/** The rectangle a static map image covers. Plain data: crosses to the client. */
export interface MapViewport {
  centerLat: number;
  centerLng: number;
  zoom: number;
  width: number;
  height: number;
}

/** A basemap the server has already signed. Null upstream means "no API key". */
export interface StaticMapImage {
  src: string;
  viewport: MapViewport;
}

/** Operations map: wide enough for a bundle, short enough to sit in a panel. */
export const BUNDLE_MAP = { width: 560, height: 360, padding: 44 } as const;

/** Single-request locator in the detail sidebar. */
export const LOCATION_MAP = { width: 420, height: 315, zoom: 17 } as const;

interface WorldPoint {
  /** Both in [0, 1]: fraction of the world, independent of zoom. */
  x: number;
  y: number;
}

function toWorld(latitude: number, longitude: number): WorldPoint {
  // Clamped short of the poles: the log below diverges at +/-90.
  const siny = Math.min(Math.max(Math.sin((latitude * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: 0.5 + longitude / 360,
    y: 0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI),
  };
}

function fromWorld(point: WorldPoint): { latitude: number; longitude: number } {
  const siny = Math.tanh((0.5 - point.y) * 2 * Math.PI);
  return {
    latitude: (Math.asin(siny) * 180) / Math.PI,
    longitude: (point.x - 0.5) * 360,
  };
}

function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

type LocatedPoint = Point & { latitude: number; longitude: number };

export function hasCoordinates(point: Point): point is LocatedPoint {
  return point.latitude !== null && point.longitude !== null;
}

/**
 * Smallest integer zoom at which every point fits inside the image, with
 * `padding` pixels of margin. Null when nothing has coordinates.
 */
export function fitViewport(
  points: Point[],
  size: { width: number; height: number; padding: number }
): MapViewport | null {
  const located = points.filter(hasCoordinates);
  if (located.length === 0) return null;

  const world = located.map((p) => toWorld(p.latitude, p.longitude));
  const minX = Math.min(...world.map((p) => p.x));
  const maxX = Math.max(...world.map((p) => p.x));
  const minY = Math.min(...world.map((p) => p.y));
  const maxY = Math.max(...world.map((p) => p.y));

  const center = fromWorld({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const usableWidth = Math.max(size.width - size.padding * 2, 1);
  const usableHeight = Math.max(size.height - size.padding * 2, 1);

  let zoom = SINGLE_POINT_ZOOM;
  if (spanX > 0 || spanY > 0) {
    const fitX = spanX > 0 ? Math.log2(usableWidth / (spanX * TILE_SIZE)) : MAX_ZOOM;
    const fitY = spanY > 0 ? Math.log2(usableHeight / (spanY * TILE_SIZE)) : MAX_ZOOM;
    zoom = Math.floor(Math.min(fitX, fitY));
  }

  return {
    centerLat: center.latitude,
    centerLng: center.longitude,
    zoom: Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM),
    width: size.width,
    height: size.height,
  };
}

/** Viewport centred on one point at a fixed zoom. */
export function pointViewport(
  point: LocatedPoint,
  size: { width: number; height: number; zoom: number }
): MapViewport {
  return {
    centerLat: point.latitude,
    centerLng: point.longitude,
    zoom: size.zoom,
    width: size.width,
    height: size.height,
  };
}

/** Where a coordinate lands in the image, in pixels from its top-left corner. */
export function toPixel(
  viewport: MapViewport,
  point: LocatedPoint
): { x: number; y: number } {
  const scale = worldSize(viewport.zoom);
  const center = toWorld(viewport.centerLat, viewport.centerLng);
  const target = toWorld(point.latitude, point.longitude);
  return {
    x: viewport.width / 2 + (target.x - center.x) * scale,
    y: viewport.height / 2 + (target.y - center.y) * scale,
  };
}

/** Ground resolution at the centre of the viewport - drives the scale bar. */
export function metersPerPixel(viewport: MapViewport): number {
  return (
    (EQUATOR_METERS_PER_PIXEL * Math.cos((viewport.centerLat * Math.PI) / 180)) /
    2 ** viewport.zoom
  );
}
