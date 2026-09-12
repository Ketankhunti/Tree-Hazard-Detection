import { config } from "./config";
import type { LocationSource } from "./types";

/**
 * Address -> coordinates.
 *
 * Clustering is worthless without coordinates, and a resident types a street
 * name, not a latitude. Resolution order:
 *
 *   1. EXIF GPS from the submitted photo  (most accurate - the phone was there)
 *   2. Local Halifax gazetteer             (offline, always available)
 *   3. Live geocoder                       (opt-in via GEOCODER_URL)
 *   4. Nothing                             (request is stored, flagged for a
 *                                           manual pin, and excluded from
 *                                           distance calculations)
 *
 * The gazetteer is a pragmatic stand-in for a real geocoding service: street
 * centroids for the Halifax peninsula, good to a few hundred metres. That is
 * accurate enough to cluster by street but NOT accurate enough to tell two
 * trees on the same block apart - which is why EXIF wins when present.
 */

export interface StreetEntry {
  street: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
}

export const HALIFAX_STREETS: StreetEntry[] = [
  { street: "Agricola Street", neighborhood: "North End", latitude: 44.6592, longitude: -63.5968 },
  { street: "Almon Street", neighborhood: "Hydrostone", latitude: 44.6601, longitude: -63.5993 },
  { street: "Barrington Street", neighborhood: "Downtown Halifax", latitude: 44.6459, longitude: -63.5738 },
  { street: "Brunswick Street", neighborhood: "Downtown Halifax", latitude: 44.6514, longitude: -63.5849 },
  { street: "Chebucto Road", neighborhood: "West End", latitude: 44.6448, longitude: -63.6015 },
  { street: "Connaught Avenue", neighborhood: "West End", latitude: 44.6489, longitude: -63.6087 },
  { street: "Cork Street", neighborhood: "West End", latitude: 44.647, longitude: -63.5995 },
  { street: "Duffus Street", neighborhood: "North End", latitude: 44.662, longitude: -63.5952 },
  { street: "Dutch Village Road", neighborhood: "Fairview", latitude: 44.6617, longitude: -63.6272 },
  { street: "Edward Street", neighborhood: "South End", latitude: 44.6402, longitude: -63.5893 },
  { street: "Gottingen Street", neighborhood: "North End", latitude: 44.6528, longitude: -63.5885 },
  { street: "Inglis Street", neighborhood: "South End", latitude: 44.6301, longitude: -63.5762 },
  { street: "Isleville Street", neighborhood: "North End", latitude: 44.6585, longitude: -63.5944 },
  { street: "Jubilee Road", neighborhood: "South End", latitude: 44.6387, longitude: -63.5936 },
  { street: "Lawrence Street", neighborhood: "North End", latitude: 44.6539, longitude: -63.5907 },
  { street: "North Street", neighborhood: "North End", latitude: 44.6561, longitude: -63.5921 },
  { street: "Oxford Street", neighborhood: "West End", latitude: 44.6462, longitude: -63.601 },
  { street: "Pepperell Street", neighborhood: "West End", latitude: 44.6435, longitude: -63.5985 },
  { street: "Preston Street", neighborhood: "Schmidtville", latitude: 44.6408, longitude: -63.5836 },
  { street: "Quinpool Road", neighborhood: "Quinpool District", latitude: 44.6455, longitude: -63.5971 },
  { street: "Robie Street", neighborhood: "Peninsula North", latitude: 44.6567, longitude: -63.5981 },
  { street: "Seaforth Street", neighborhood: "Fairview", latitude: 44.6644, longitude: -63.6231 },
  { street: "South Park Street", neighborhood: "South End", latitude: 44.6421, longitude: -63.5811 },
  { street: "Spring Garden Road", neighborhood: "South End", latitude: 44.6432, longitude: -63.5795 },
  { street: "Tower Road", neighborhood: "South End", latitude: 44.6395, longitude: -63.5848 },
  { street: "Vernon Street", neighborhood: "West End", latitude: 44.644, longitude: -63.595 },
  { street: "Windsor Street", neighborhood: "West End", latitude: 44.6535, longitude: -63.6042 },
  { street: "Young Street", neighborhood: "North End", latitude: 44.6612, longitude: -63.5981 },
];

export const KNOWN_STREET_NAMES = HALIFAX_STREETS.map((entry) => entry.street);

/** Common ways residents abbreviate the street-type suffix. */
const SUFFIX_ALIASES: Record<string, string> = {
  st: "street",
  str: "street",
  rd: "road",
  ave: "avenue",
  av: "avenue",
  dr: "drive",
  ln: "lane",
  cres: "crescent",
  blvd: "boulevard",
  pl: "place",
  ct: "court",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => SUFFIX_ALIASES[token] ?? token)
    .join(" ");
}

/**
 * Pulls a known street out of a free-text address.
 *
 * Longest match wins so "South Park Street" is not shadowed by a shorter
 * entry, and the house number is ignored entirely.
 */
export function matchStreet(address: string): StreetEntry | null {
  const haystack = normalize(address);
  let best: StreetEntry | null = null;

  for (const entry of HALIFAX_STREETS) {
    const needle = normalize(entry.street);
    if (haystack.includes(needle)) {
      if (!best || needle.length > normalize(best.street).length) best = entry;
    }
  }
  return best;
}

export interface ResolvedLocation {
  street: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  source: LocationSource;
  /** Shown to the admin so a coarse fix is never mistaken for a survey point. */
  note: string;
}

/** Best-effort street label when the address matches nothing known. */
function fallbackStreet(address: string): string {
  const withoutNumber = address.replace(/^\s*\d+[a-zA-Z]?\s+/, "").trim();
  return withoutNumber || address.trim() || "Unknown Street";
}

async function geocodeRemote(
  address: string
): Promise<{ latitude: number; longitude: number } | null> {
  if (!config.geocoderUrl) return null;
  try {
    const url = new URL(config.geocoderUrl);
    url.searchParams.set("q", `${address}, Halifax, Nova Scotia, Canada`);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: { "User-Agent": config.geocoderUserAgent },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;

    const results = (await response.json()) as Array<{ lat: string; lon: string }>;
    const first = results[0];
    if (!first) return null;

    return { latitude: Number(first.lat), longitude: Number(first.lon) };
  } catch {
    // Network failures must never block a submission.
    return null;
  }
}

export async function resolveLocation(input: {
  address: string;
  exif?: { latitude: number; longitude: number } | null;
}): Promise<ResolvedLocation> {
  const entry = matchStreet(input.address);
  const street = entry?.street ?? fallbackStreet(input.address);
  const neighborhood = entry?.neighborhood ?? "Unassigned";

  // 1. The phone's own GPS beats any lookup.
  if (input.exif) {
    return {
      street,
      neighborhood,
      latitude: input.exif.latitude,
      longitude: input.exif.longitude,
      source: "exif",
      note: "Coordinates read from the submitted photo's GPS metadata.",
    };
  }

  // 2. Live geocoder, when one is configured.
  const remote = await geocodeRemote(input.address);
  if (remote) {
    return {
      street,
      neighborhood,
      latitude: remote.latitude,
      longitude: remote.longitude,
      source: "geocoded",
      note: "Coordinates from the configured geocoding service.",
    };
  }

  // 3. Local gazetteer: street-level accuracy only.
  if (entry) {
    return {
      street: entry.street,
      neighborhood: entry.neighborhood,
      latitude: entry.latitude,
      longitude: entry.longitude,
      source: "geocoded",
      note: `Approximate street centroid for ${entry.street}. Accurate to a few hundred metres - confirm the pin before dispatch.`,
    };
  }

  // 4. Unlocatable. Stored anyway; excluded from distance maths.
  return {
    street,
    neighborhood,
    latitude: null,
    longitude: null,
    source: "manual",
    note: "Address did not match a known Halifax street. Needs a manual map pin before it can be bundled with nearby work.",
  };
}
