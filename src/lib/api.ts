/**
 * Frontend API client for the Tree Hazard Detection backend.
 *
 * Fetches real HRM Open Data via the backend proxy.
 * Falls back to mock data if the backend is unavailable.
 */

import type { TreeComplaint } from "../types";
import { mockTrees } from "../data/mockTrees";

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:3001/api";

export interface BackendComplaint extends TreeComplaint {
  treeData?: {
    assetId: string;
    commonName: string;
    scientificName: string;
    dbh: number;
    dbhLabel: string;
    wiresPresent: boolean;
    featureCode: string;
    featureLabel: string;
    assetStatus: string;
    statusLabel: string;
    generalLocation: string;
    yearPlanted: number | null;
  };
}

export interface Tree311Call {
  callId: string;
  queueName: string;
  wrapupName: string;
  arrivalDate: string | null;
  talkTimeSeconds: number;
  durationSeconds: number;
  outcome: string;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Fetch all complaints from the backend.
 * Falls back to mock data on error.
 */
export async function fetchComplaints(): Promise<{
  complaints: BackendComplaint[];
  source: "backend" | "mock";
}> {
  try {
    const res = await fetch(`${API_BASE}/complaints`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { complaints: data.complaints, source: "backend" };
  } catch (err) {
    console.warn("Backend unavailable, using mock data:", getErrorMessage(err));
    return { complaints: mockTrees, source: "mock" };
  }
}

/**
 * Fetch a single complaint by ID.
 * Falls back to mock data on error.
 */
export async function fetchComplaintById(
  id: string
): Promise<{ complaint: BackendComplaint | null; source: "backend" | "mock" }> {
  try {
    const res = await fetch(`${API_BASE}/complaints/${id}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const complaint = await res.json();
    return { complaint, source: "backend" };
  } catch (err) {
    console.warn("Backend unavailable, using mock data:", getErrorMessage(err));
    const complaint = mockTrees.find((c) => c.id === id) || null;
    return { complaint, source: "mock" };
  }
}

/**
 * Fetch the full Halifax tree inventory for the map.
 */
export async function fetchTreeInventory(): Promise<BackendComplaint["treeData"][]> {
  try {
    const res = await fetch(`${API_BASE}/trees`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.trees;
  } catch (err) {
    console.warn("Tree inventory unavailable:", getErrorMessage(err));
    return [];
  }
}

/**
 * Fetch recent tree-related 311 calls.
 */
export async function fetch311Calls(): Promise<Tree311Call[]> {
  try {
    const res = await fetch(`${API_BASE}/311-calls`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.calls;
  } catch (err) {
    console.warn("311 calls unavailable:", getErrorMessage(err));
    return [];
  }
}

/**
 * Submit a new tree hazard complaint from the citizen portal.
 * Sends multipart/form-data if photos are included, JSON otherwise.
 */
export async function submitComplaint(input: {
  address: string;
  neighborhood: string;
  complaintText: string;
  latitude: number;
  longitude: number;
  photos: File[];
}): Promise<{ id: string; message: string }> {
  const hasPhotos = input.photos.length > 0;

  if (hasPhotos) {
    const formData = new FormData();
    formData.append("address", input.address);
    formData.append("neighborhood", input.neighborhood);
    formData.append("complaintText", input.complaintText);
    formData.append("latitude", String(input.latitude));
    formData.append("longitude", String(input.longitude));
    for (const photo of input.photos) {
      formData.append("photos", photo);
    }

    const res = await fetch(`${API_BASE}/complaints`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  const res = await fetch(`${API_BASE}/complaints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: input.address,
      neighborhood: input.neighborhood,
      complaintText: input.complaintText,
      latitude: input.latitude,
      longitude: input.longitude,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface GeocodeResult {
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

/**
 * Geocode a Halifax street address using the backend proxy or client-side Google Maps API.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address.trim()) return null;

  // 1. Try backend proxy first
  try {
    const res = await fetch(`${API_BASE}/geocode?address=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fall back to direct client request
  }

  // 2. Direct client-side Google Maps Geocoding fallback
  const clientKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (clientKey) {
    try {
      const query = address.toLowerCase().includes("halifax") ? address : `${address}, Halifax, NS`;
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${clientKey}`,
        { signal: AbortSignal.timeout(6000) }
      );
      const data = await res.json();
      if (data.status === "OK" && data.results?.[0]) {
        const item = data.results[0];
        return {
          formattedAddress: item.formatted_address,
          latitude: item.geometry.location.lat,
          longitude: item.geometry.location.lng,
        };
      }
    } catch (err) {
      console.warn("Client geocoding failed:", getErrorMessage(err));
    }
  }

  return null;
}

/**
 * Fetch cached AI hazard scores for all complaints.
 * Returns a map of complaintId → AIHazardAnalysis.
 * Used by the dashboard to show live AI-powered scores.
 */
export async function fetchAIScores(): Promise<Record<string, AIHazardAnalysis>> {
  try {
    const res = await fetch(`${API_BASE}/ai-scores`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.scores || {};
  } catch (err) {
    console.warn("AI scores unavailable:", getErrorMessage(err));
    return {};
  }
}

/**
 * Trigger batch AI analysis for all complaints that don't have cached results yet.
 * Returns immediately with counts; the dashboard polls /api/ai-scores for live progress.
 */
export async function fetchAnalyzeAll(): Promise<{
  message: string;
  total: number;
  pending: number;
  alreadyCached: number;
}> {
  const res = await fetch(`${API_BASE}/analyze-all`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * AI hazard analysis result from the backend LLM.
 */
export interface AIHazardAnalysis {
  dangerScore: number;
  hazards: { label: string; points: number; source: "image" }[];
  isUnsure: boolean;
  textImageConflict: boolean;
  confidence: number;
  reasoning: string;
  hasImage: boolean;
  photoDescription: string | null;
  summary: string;
}

/**
 * Analyze a complaint's hazard level using the backend LLM.
 * Sends the complaint text + photo (by complaintId lookup or direct upload).
 */
export async function analyzeHazard(input: {
  complaintText: string;
  complaintId?: string;
  photo?: File;
}): Promise<AIHazardAnalysis> {
  const formData = new FormData();
  formData.append("complaintText", input.complaintText);
  if (input.complaintId) formData.append("complaintId", input.complaintId);
  if (input.photo) formData.append("photos", input.photo);
  const res = await fetch(`${API_BASE}/analyze-hazard`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
