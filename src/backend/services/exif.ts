import exifr from "exifr";

/**
 * GPS extraction from a submitted photo.
 *
 * When a resident uploads straight from their phone the image usually carries
 * the coordinates of the place the picture was taken, which is a far better
 * location than anything derived from a typed address. Many photos have it
 * stripped (screenshots, messaging apps, privacy settings), so this is always
 * treated as a bonus, never a requirement.
 */

export interface ExifLocation {
  latitude: number;
  longitude: number;
}

/** Rough bounding box for Halifax Regional Municipality. */
function withinHalifax(latitude: number, longitude: number): boolean {
  return (
    latitude > 44.3 && latitude < 45.2 && longitude > -64.2 && longitude < -62.8
  );
}

/**
 * Returns coordinates only when they are present, numeric, and plausibly in
 * Halifax. A photo taken on holiday elsewhere would otherwise drop a pin in
 * the wrong hemisphere and poison the clustering.
 */
export async function extractGps(data: Buffer): Promise<ExifLocation | null> {
  try {
    const gps = await exifr.gps(data);
    if (!gps) return null;

    const { latitude, longitude } = gps;
    if (typeof latitude !== "number" || typeof longitude !== "number") return null;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude === 0 && longitude === 0) return null;
    if (!withinHalifax(latitude, longitude)) return null;

    return { latitude, longitude };
  } catch {
    // Unsupported or corrupt metadata is not an error worth failing a
    // submission over.
    return null;
  }
}
