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
    console.warn("Backend unavailable, using mock data:", err.message);
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
    console.warn("Backend unavailable, using mock data:", err.message);
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
    console.warn("Tree inventory unavailable:", err.message);
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
    console.warn("311 calls unavailable:", err.message);
    return [];
  }
}
