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
   * Opt-in live geocoding. Off by default so the app never depends on a
   * third-party service being reachable during a demo; the local Halifax
   * gazetteer handles the seeded street names either way.
   */
  geocoderUrl: process.env.GEOCODER_URL ?? null,
  geocoderUserAgent:
    process.env.GEOCODER_USER_AGENT ?? "halifax-tree-triage/2.0 (demo)",

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
