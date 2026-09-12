import { config } from "@/backend/config";
import type { LocationSource } from "@/shared/types";

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
  /** How trustworthy the coordinates are. Null when there are none. */
  precision: LocationPrecision | null;
  /** Shown to the admin so a coarse fix is never mistaken for a survey point. */
  note: string;
}

/** Best-effort street label when the address matches nothing known. */
function fallbackStreet(address: string): string {
  const withoutNumber = address.replace(/^\s*\d+[a-zA-Z]?\s+/, "").trim();
  return withoutNumber || address.trim() || "Unknown Street";
}

/**
 * Coordinate precision, as reported by the geocoding provider.
 *
 * This matters more than it looks. Duplicate detection merges reports within
 * ~90 m of each other, so a ROOFTOP fix makes that decision trustworthy while
 * an APPROXIMATE one (a locality centroid) would put every address on the block
 * at the same point and over-merge. Precision travels with the result so the
 * admin can see what the pin is actually worth.
 */
export type LocationPrecision =
  | "rooftop"
  | "interpolated"
  | "street"
  | "approximate";

const PRECISION_LABEL: Record<LocationPrecision, string> = {
  rooftop: "building-level",
  interpolated: "interpolated along the street",
  street: "street-level",
  approximate: "approximate (neighbourhood-level)",
};

interface RemoteResult {
  latitude: number;
  longitude: number;
  precision: LocationPrecision;
  formattedAddress: string | null;
  provider: string;
}

/** Halifax Regional Municipality, roughly. Guards against a wrong-city match. */
function withinHalifax(latitude: number, longitude: number): boolean {
  return (
    latitude > 44.3 && latitude < 45.2 && longitude > -64.2 && longitude < -62.8
  );
}

const GOOGLE_PRECISION: Record<string, LocationPrecision> = {
  ROOFTOP: "rooftop",
  RANGE_INTERPOLATED: "interpolated",
  GEOMETRIC_CENTER: "street",
  APPROXIMATE: "approximate",
};

interface GoogleResponse {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address?: string;
    geometry?: {
      location?: { lat: number; lng: number };
      location_type?: string;
    };
  }>;
}

/**
 * Google Geocoding API.
 *
 * Biased to Halifax with `components`, which is a hard filter rather than a
 * hint - "Robie Street" exists in other cities and an unfiltered query will
 * cheerfully return one of them.
 */
async function geocodeGoogle(address: string): Promise<RemoteResult | null> {
  const key = config.googleMapsApiKey;
  if (!key) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set(
      "components",
      "country:CA|administrative_area:NS|locality:Halifax"
    );
    url.searchParams.set("region", "ca");
    url.searchParams.set("key", key);

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      console.warn("[geocode] Google HTTP " + response.status);
      return null;
    }

    const body = (await response.json()) as GoogleResponse;

    // These are configuration failures, not "address not found". Surfacing them
    // loudly saves a long hunt for why every pin is a street centroid.
    if (body.status === "REQUEST_DENIED" || body.status === "INVALID_REQUEST") {
      console.error(
        "[geocode] Google rejected the request (" +
          body.status +
          "): " +
          (body.error_message ??
            "check the key, its referrer/IP restrictions, and that the " +
              "Geocoding API is enabled for the project")
      );
      return null;
    }
    if (body.status === "OVER_QUERY_LIMIT" || body.status === "OVER_DAILY_LIMIT") {
      console.error("[geocode] Google quota exhausted (" + body.status + ")");
      return null;
    }
    if (body.status !== "OK") return null;

    const first = body.results[0];
    const point = first?.geometry?.location;
    if (!point) return null;

    if (!withinHalifax(point.lat, point.lng)) {
      console.warn(
        '[geocode] Google returned a point outside Halifax for "' +
          address +
          '"; ignoring'
      );
      return null;
    }

    return {
      latitude: point.lat,
      longitude: point.lng,
      precision:
        GOOGLE_PRECISION[first.geometry?.location_type ?? ""] ?? "approximate",
      formattedAddress: first.formatted_address ?? null,
      provider: "google",
    };
  } catch {
    // Timeouts and network failures must never block a submission.
    return null;
  }
}

/** Nominatim-compatible fallback, used when no Google key is configured. */
async function geocodeNominatim(address: string): Promise<RemoteResult | null> {
  if (!config.geocoderUrl) return null;
  try {
    const url = new URL(config.geocoderUrl);
    url.searchParams.set("q", address + ", Halifax, Nova Scotia, Canada");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: { "User-Agent": config.geocoderUserAgent },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const results = (await response.json()) as Array<{
      lat: string;
      lon: string;
      display_name?: string;
    }>;
    const first = results[0];
    if (!first) return null;

    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!withinHalifax(latitude, longitude)) return null;

    return {
      latitude,
      longitude,
      // Nominatim does not report precision in a comparable way.
      precision: "street",
      formattedAddress: first.display_name ?? null,
      provider: "nominatim",
    };
  } catch {
    return null;
  }
}

/** Google when a key is present, otherwise Nominatim, otherwise nothing. */
async function geocodeRemote(address: string): Promise<RemoteResult | null> {
  return (await geocodeGoogle(address)) ?? (await geocodeNominatim(address));
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
      precision: "rooftop",
      note: "Coordinates read from the submitted photo's GPS metadata - the phone was at the tree.",
    };
  }

  // 2. Live geocoder, when one is configured.
  //
  // An APPROXIMATE result is a locality centroid, not a location: every address
  // Google cannot recognise in Halifax comes back as the same downtown point.
  // Accepting those would stack unrelated reports inside the 90 m duplicate
  // radius and merge them into one tree, so they are discarded in favour of a
  // street centroid or an honest blank.
  const remote = await geocodeRemote(input.address);
  const located = remote && remote.precision !== "approximate" ? remote : null;

  if (located) {
    return {
      street,
      neighborhood,
      latitude: located.latitude,
      longitude: located.longitude,
      source: "geocoded",
      precision: located.precision,
      note:
        "Geocoded by " +
        located.provider +
        " to " +
        PRECISION_LABEL[located.precision] +
        " accuracy" +
        (located.formattedAddress ? " (" + located.formattedAddress + ")" : "") +
        ".",
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
      precision: "street",
      note: `Street centroid for ${entry.street} from the local gazetteer. Accurate to a few hundred metres - confirm the pin before dispatch.`,
    };
  }

  // 4. Unlocatable. Stored anyway; excluded from distance maths.
  return {
    street,
    neighborhood,
    latitude: null,
    longitude: null,
    source: "manual",
    precision: null,
    note: remote
      ? `Address did not match a known Halifax street, and ${remote.provider} could only place it at the municipality level` +
        (remote.formattedAddress ? ` (${remote.formattedAddress})` : "") +
        ". Needs a manual map pin before it can be bundled with nearby work."
      : "Address did not match a known Halifax street and geocoding returned nothing. Needs a manual map pin before it can be bundled with nearby work.",
  };
}
