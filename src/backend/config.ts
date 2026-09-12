/**
 * Runtime configuration, all optional.
 *
 * The app must run with an empty environment: no API key, no network. Every
 * feature that depends on an external service degrades to a local fallback and
 * says so in the UI rather than failing the request.
 */

export const config = {
  /** Vision analysis is skipped entirely when this is unset. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,

  /** Model used to assess submitted photos. */
  visionModel: process.env.VISION_MODEL ?? "claude-opus-5",

  /**
   * Google Maps Platform key, used for both Geocoding and the Static Maps
   * basemap. Optional on purpose - the local Halifax gazetteer resolves the
   * known streets with no network call and the maps fall back to a coordinate
   * plot, so a demo never depends on a third-party service being reachable.
   *
   * Requires the Geocoding API and the Maps Static API to be enabled on the
   * project.
   *
   * Read server-side only. Do NOT rename this with a NEXT_PUBLIC_ prefix: that
   * would ship the key in the browser bundle where anyone can spend it. Map
   * imagery reaches the browser through /api/map instead.
   */
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? null,

  /**
   * Signs /api/map URLs so the proxy cannot be used as a free image service.
   * Defaults to the API key, which is already a server-only secret.
   */
  mapProxySecret: process.env.MAP_PROXY_SECRET ?? null,

  /** Nominatim-compatible fallback, used only when no Google key is set. */
  geocoderUrl: process.env.GEOCODER_URL ?? null,
  geocoderUserAgent:
    process.env.GEOCODER_USER_AGENT ?? "halifax-tree-triage/2.0 (demo)",

  /**
   * Admin console credentials.
   *
   * A single hardcoded operator, not a user table: the console has one audience
   * (HRM Urban Forestry staff) and the point of the gate is that /admin is not
   * world-readable. Real identities land with the status_history actor column,
   * which already exists.
   */
  admin: {
    username: process.env.ADMIN_USERNAME ?? "admin",
    password: process.env.ADMIN_PASSWORD ?? "admin",
    /** Signs the session cookie. Falls back to a server-only value. */
    sessionSecret: process.env.ADMIN_SESSION_SECRET ?? null,
    /** Sessions expire after one shift so a shared depot terminal logs itself out. */
    sessionHours: Number(process.env.ADMIN_SESSION_HOURS ?? 12),
  },

  crew: {
    /** Length of one crew shift, in hours. */
    shiftHours: Number(process.env.CREW_SHIFT_HOURS ?? 8),
    /** Hard cap on how far a bundled job may sit from the anchor. */
    maxDetourMeters: Number(process.env.CREW_MAX_DETOUR_M ?? 1000),
    /** Average urban travel speed, km/h, including stops and parking. */
    travelSpeedKmh: Number(process.env.CREW_TRAVEL_KMH ?? 22),
    /** Mobilize/demobilize overhead charged to each additional site, minutes. */
    setupMinutesPerSite: Number(process.env.CREW_SETUP_MINUTES ?? 20),
    /** Most jobs to recommend alongside the anchor. */
    maxRecommendations: Number(process.env.CREW_MAX_RECOMMENDATIONS ?? 5),
  },

  duplicates: {
    /** Two reports closer than this are candidates for being the same tree. */
    radiusMeters: Number(process.env.DUPLICATE_RADIUS_M ?? 90),
    /** ...and submitted within this many days of each other. */
    windowDays: Number(process.env.DUPLICATE_WINDOW_DAYS ?? 21),
    /** Jaccard similarity above which descriptions count as corroborating. */
    similarityThreshold: Number(process.env.DUPLICATE_SIMILARITY ?? 0.18),
    /** Combined confidence at or above which the link is made automatically. */
    autoLinkConfidence: Number(process.env.DUPLICATE_AUTOLINK ?? 0.72),
  },
} as const;

export function hasVision(): boolean {
  return config.anthropicApiKey !== null;
}

/** True when addresses geocode through Google and maps render real streets. */
export function hasMaps(): boolean {
  return config.googleMapsApiKey !== null;
}
