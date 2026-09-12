/**
 * HRM Open Data API Client
 *
 * Fetches real data from Halifax Regional Municipality's ArcGIS Open Data portal:
 * 1. Public Trees — 80,051 tree assets with species, location, DBH, wires, status
 * 2. 311 Call Details — 4.9M call records, filtered for tree-related calls (WRAPUP_NAME = "Trees")
 *
 * ArcGIS REST API docs: https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/
 */

const PUBLIC_TREES_URL =
  "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/Public_Trees/FeatureServer/0/query";
const CALL_DETAILS_URL =
  "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/311_Call_Details/FeatureServer/0/query";

// Web Mercator (EPSG:3857) → WGS84 (EPSG:4326) conversion
function webMercatorToLatLng(x, y) {
  const lon = (x / 20037508.34) * 180;
  const lat = (y / 20037508.34) * 180;
  const latRad = (lat * Math.PI) / 180;
  return {
    lat: (180 / Math.PI) * (2 * Math.atan(Math.exp(latRad)) - Math.PI / 2),
    lng: lon,
  };
}

// DBH code → human-readable size
const DBH_LABELS = {
  1: "0-8 cm (sapling)",
  2: "8-16 cm (young)",
  3: "16-31 cm (small)",
  4: "31-46 cm (medium)",
  5: "46-61 cm (mature)",
  6: "61-77 cm (large)",
  7: "77-91 cm (very large)",
  8: "91-107 cm (specimen)",
  9: ">107 cm (heritage)",
};

// FCODE → human-readable
const FCODE_LABELS = {
  LCTS: "Single Tree",
  LCST: "Tree Stump",
  LCTA: "Tree Area - Grove",
  LCVSS: "Vacant Small Site",
  LCVSM: "Vacant Medium Site",
  LCVSL: "Vacant Large Site",
  LCDS: "Dead Tree",
};

// ASSETSTAT → human-readable
const STATUS_LABELS = {
  PRP: "Proposed",
  PND: "Pending",
  INS: "In Service",
  OUT: "Out of Service",
  SRP: "Surplus",
  DIS: "Disposed",
  DCR: "Data Correction",
};

/**
 * Fetch trees near a given street from the HRM Public Trees dataset.
 * @param {string} streetName - e.g. "QUINPOOL" (partial match, uppercase)
 * @param {number} limit - max results
 * @returns {Promise<Array>} array of tree objects
 */
export async function fetchTreesByStreet(streetName, limit = 10) {
  const where = `LOCATION LIKE '%${streetName.toUpperCase()}%'`;
  const params = new URLSearchParams({
    where,
    outFields:
      "ASSETID,LOCATION,SP_COMM,SP_SCIEN,DBH,WIRES,FCODE,ASSETSTAT,LOCGEN,INSTYR",
    returnGeometry: "true",
    geometryPrecision: "2",
    resultRecordCount: String(limit),
    f: "json",
  });

  const res = await fetch(`${PUBLIC_TREES_URL}?${params}`);
  if (!res.ok) throw new Error(`HRM API error: ${res.status}`);
  const data = await res.json();

  if (data.error) throw new Error(`HRM API error: ${data.error.message}`);

  return (data.features || []).map((f) => {
    const { lat, lng } = webMercatorToLatLng(f.geometry.x, f.geometry.y);
    const a = f.attributes;
    return {
      assetId: a.ASSETID,
      location: a.LOCATION,
      commonName: a.SP_COMM || "Unknown",
      scientificName: a.SP_SCIEN || "",
      dbh: a.DBH,
      dbhLabel: DBH_LABELS[a.DBH] || "Unknown",
      wiresPresent: a.WIRES === "Y",
      featureCode: a.FCODE,
      featureLabel: FCODE_LABELS[a.FCODE] || a.FCODE,
      assetStatus: a.ASSETSTAT,
      statusLabel: STATUS_LABELS[a.ASSETSTAT] || a.ASSETSTAT,
      generalLocation: a.LOCGEN,
      yearPlanted: a.INSTYR || null,
      latitude: parseFloat(lat.toFixed(6)),
      longitude: parseFloat(lng.toFixed(6)),
    };
  });
}

/**
 * Fetch all trees within a bounding box around Halifax Peninsula.
 * Used to build the full tree inventory map.
 * @param {number} limit - max results (default 1000, ArcGIS max)
 * @returns {Promise<Array>} array of tree objects
 */
export async function fetchTreesInHalifax(limit = 1000) {
  // Halifax Peninsula bounding box in Web Mercator
  // Approx: -63.60 to -63.55 lng, 44.63 to 44.68 lat
  const geometry = JSON.stringify({
    xmin: -7080000,
    ymin: 5560000,
    xmax: -7075000,
    ymax: 5570000,
    spatialReference: { wkid: 102100 },
  });

  const params = new URLSearchParams({
    where: "1=1",
    outFields:
      "ASSETID,LOCATION,SP_COMM,SP_SCIEN,DBH,WIRES,FCODE,ASSETSTAT,LOCGEN",
    returnGeometry: "true",
    geometry: geometry,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    geometryPrecision: "2",
    resultRecordCount: String(limit),
    f: "json",
  });

  const res = await fetch(`${PUBLIC_TREES_URL}?${params}`);
  if (!res.ok) throw new Error(`HRM API error: ${res.status}`);
  const data = await res.json();

  if (data.error) throw new Error(`HRM API error: ${data.error.message}`);

  return (data.features || []).map((f) => {
    const { lat, lng } = webMercatorToLatLng(f.geometry.x, f.geometry.y);
    const a = f.attributes;
    return {
      assetId: a.ASSETID,
      location: a.LOCATION,
      commonName: a.SP_COMM || "Unknown",
      scientificName: a.SP_SCIEN || "",
      dbh: a.DBH,
      dbhLabel: DBH_LABELS[a.DBH] || "Unknown",
      wiresPresent: a.WIRES === "Y",
      featureCode: a.FCODE,
      featureLabel: FCODE_LABELS[a.FCODE] || a.FCODE,
      assetStatus: a.ASSETSTAT,
      statusLabel: STATUS_LABELS[a.ASSETSTAT] || a.ASSETSTAT,
      generalLocation: a.LOCGEN,
      latitude: parseFloat(lat.toFixed(6)),
      longitude: parseFloat(lng.toFixed(6)),
    };
  });
}

/**
 * Fetch recent 311 calls related to trees.
 * The WRAPUP_NAME field = "Trees" for tree-related service requests.
 * @param {number} limit - max results
 * @returns {Promise<Array>} array of 311 call objects
 */
export async function fetchTree311Calls(limit = 50) {
  const params = new URLSearchParams({
    where: "WRAPUP_NAME = 'Trees'",
    outFields:
      "CALL_ID,QUEUE_NAME,WRAPUP_NAME,ARRIVAL_DATETIME,TALK_TIME_IN_SECONDS,DURATION_IN_SECONDS,OUTCOME",
    resultRecordCount: String(limit),
    orderByFields: "ARRIVAL_DATETIME DESC",
    f: "json",
  });

  const res = await fetch(`${CALL_DETAILS_URL}?${params}`);
  if (!res.ok) throw new Error(`HRM 311 API error: ${res.status}`);
  const data = await res.json();

  if (data.error) throw new Error(`HRM 311 API error: ${data.error.message}`);

  return (data.features || []).map((f) => {
    const a = f.attributes;
    return {
      callId: a.CALL_ID,
      queueName: a.QUEUE_NAME || "Unknown",
      wrapupName: a.WRAPUP_NAME,
      arrivalDate: a.ARRIVAL_DATETIME
        ? new Date(a.ARRIVAL_DATETIME).toISOString()
        : null,
      talkTimeSeconds: a.TALK_TIME_IN_SECONDS || 0,
      durationSeconds: a.DURATION_IN_SECONDS || 0,
      outcome: a.OUTCOME || "Unknown",
    };
  });
}

/**
 * Fetch 311 call volume statistics for tree-related calls.
 * Returns counts by queue name.
 * @returns {Promise<Object>} stats object
 */
export async function fetchTree311Stats() {
  const params = new URLSearchParams({
    where: "WRAPUP_NAME = 'Trees'",
    outFields: "QUEUE_NAME",
    resultRecordCount: "1000",
    f: "json",
  });

  const res = await fetch(`${CALL_DETAILS_URL}?${params}`);
  if (!res.ok) throw new Error(`HRM 311 API error: ${res.status}`);
  const data = await res.json();

  if (data.error) throw new Error(`HRM 311 API error: ${data.error.message}`);

  const queueCounts = {};
  let total = 0;
  for (const f of data.features || []) {
    const q = f.attributes.QUEUE_NAME || "Unknown";
    queueCounts[q] = (queueCounts[q] || 0) + 1;
    total++;
  }

  return { totalCalls: total, byQueue: queueCounts };
}
