import { describe, expect, it } from "vitest";

import { distanceMeters } from "./geo";
import {
  BUNDLE_MAP,
  LOCATION_MAP,
  fitViewport,
  metersPerPixel,
  pointViewport,
  toPixel,
} from "./map";

/**
 * These tests exist because the markers are drawn by us and the streets are
 * drawn by Google. If this projection drifts from Web Mercator the pins move to
 * the wrong block while still looking entirely plausible.
 */

const QUINPOOL = { latitude: 44.6455, longitude: -63.5971 };
const PEPPERELL = { latitude: 44.6435, longitude: -63.5985 };
const AGRICOLA = { latitude: 44.6592, longitude: -63.5968 };

describe("pointViewport", () => {
  it("puts its point at the centre of the image", () => {
    const viewport = pointViewport(QUINPOOL, LOCATION_MAP);
    const pixel = toPixel(viewport, QUINPOOL);
    expect(pixel.x).toBeCloseTo(LOCATION_MAP.width / 2, 6);
    expect(pixel.y).toBeCloseTo(LOCATION_MAP.height / 2, 6);
  });
});

describe("toPixel", () => {
  it("puts north up and east right", () => {
    const viewport = pointViewport(QUINPOOL, LOCATION_MAP);
    const north = toPixel(viewport, AGRICOLA);
    const east = toPixel(viewport, { latitude: 44.6455, longitude: -63.59 });
    expect(north.y).toBeLessThan(viewport.height / 2);
    expect(east.x).toBeGreaterThan(viewport.width / 2);
  });

  it("agrees with great-circle distance at the map's own resolution", () => {
    const viewport = fitViewport([QUINPOOL, PEPPERELL], BUNDLE_MAP)!;
    const a = toPixel(viewport, QUINPOOL);
    const b = toPixel(viewport, PEPPERELL);
    const pixels = Math.hypot(b.x - a.x, b.y - a.y);

    const onGround = distanceMeters(QUINPOOL, PEPPERELL)!;
    // Mercator distorts north-south with latitude, so this is only ever
    // approximate; 2% over a few hundred metres is well inside a marker radius.
    expect(pixels * metersPerPixel(viewport)).toBeCloseTo(onGround, -1);
    expect(Math.abs(pixels * metersPerPixel(viewport) - onGround) / onGround).toBeLessThan(
      0.02
    );
  });
});

describe("fitViewport", () => {
  it("keeps every point inside the padded image", () => {
    const points = [QUINPOOL, PEPPERELL, AGRICOLA];
    const viewport = fitViewport(points, BUNDLE_MAP)!;

    for (const point of points) {
      const pixel = toPixel(viewport, point);
      expect(pixel.x).toBeGreaterThanOrEqual(BUNDLE_MAP.padding);
      expect(pixel.x).toBeLessThanOrEqual(viewport.width - BUNDLE_MAP.padding);
      expect(pixel.y).toBeGreaterThanOrEqual(BUNDLE_MAP.padding);
      expect(pixel.y).toBeLessThanOrEqual(viewport.height - BUNDLE_MAP.padding);
    }
  });

  it("zooms in further on a tight cluster than on a spread-out one", () => {
    const tight = fitViewport([QUINPOOL, PEPPERELL], BUNDLE_MAP)!;
    const spread = fitViewport([QUINPOOL, AGRICOLA], BUNDLE_MAP)!;
    expect(tight.zoom).toBeGreaterThan(spread.zoom);
  });

  it("ignores requests with no coordinates", () => {
    const viewport = fitViewport(
      [QUINPOOL, { latitude: null, longitude: null }],
      BUNDLE_MAP
    );
    expect(viewport).not.toBeNull();
    expect(viewport!.centerLat).toBeCloseTo(QUINPOOL.latitude, 6);
  });

  it("returns null when nothing can be placed", () => {
    expect(fitViewport([{ latitude: null, longitude: null }], BUNDLE_MAP)).toBeNull();
    expect(fitViewport([], BUNDLE_MAP)).toBeNull();
  });

  it("falls back to a street-level zoom for a single point", () => {
    const viewport = fitViewport([QUINPOOL], BUNDLE_MAP)!;
    expect(viewport.zoom).toBe(16);
    expect(toPixel(viewport, QUINPOOL).x).toBeCloseTo(viewport.width / 2, 6);
  });
});
