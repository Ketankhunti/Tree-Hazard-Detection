/**
 * Tree Hazard Detection Backend Server
 *
 * Zero-dependency HTTP server using Node.js built-in http module.
 * Serves real HRM Open Data to the frontend.
 *
 * Endpoints:
 *   GET  /api/complaints          — enriched complaints from real HRM tree data
 *   GET  /api/complaints/:id      — single complaint by ID
 *   POST /api/complaints           — submit a new citizen complaint (JSON or multipart)
 *   GET  /api/trees               — full Halifax tree inventory (for map)
 *   GET  /api/311-calls           — recent tree-related 311 calls
 *   GET  /api/311-stats           — 311 call statistics
 *   GET  /api/health              — health check
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import {
  fetchTree311Calls,
  fetchTree311Stats,
} from "./hrmApi.js";
import {
  generateComplaintsFromHRM,
  getHalifaxTreeInventory,
} from "./complaintGenerator.js";
import { supabase } from "./supabaseClient.js";

const PORT = process.env.PORT || 3001;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// Fallback in-memory store (used if Supabase is unavailable)
const citizenComplaints = [];
let citizenCounter = 1000;

// ── Supabase helpers ──────────────────────────────────────────

/** Map a Supabase row (snake_case) → frontend complaint (camelCase) */
function rowToComplaint(row) {
  return {
    id: row.id,
    address: row.address,
    street: row.street ?? "",
    neighborhood: row.neighborhood,
    complaintText: row.complaint_text,
    daysWaiting: row.days_waiting,
    submittedDate: row.submitted_date,
    status: row.status,
    latitude: row.latitude,
    longitude: row.longitude,
    photoUrl: row.photo_url ?? null,
    source: row.source ?? "citizen",
  };
}

/** Fetch all citizen complaints from Supabase (newest first) */
async function fetchCitizenComplaints() {
  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .order("submitted_date", { ascending: false });

  if (error) {
    console.warn("Supabase fetch failed, using in-memory fallback:", error.message);
    return citizenComplaints;
  }
  return data.map(rowToComplaint);
}

/** Save a citizen complaint to Supabase (and in-memory fallback) */
async function saveCitizenComplaint(complaint) {
  // Always keep in-memory copy as fallback
  citizenComplaints.unshift(complaint);

  const { error } = await supabase.from("complaints").insert({
    id: complaint.id,
    address: complaint.address,
    street: complaint.street,
    neighborhood: complaint.neighborhood,
    complaint_text: complaint.complaintText,
    days_waiting: complaint.daysWaiting,
    submitted_date: complaint.submittedDate,
    status: complaint.status,
    latitude: complaint.latitude,
    longitude: complaint.longitude,
    photo_url: complaint.photoUrl,
    source: complaint.source,
  });

  if (error) {
    console.warn("Supabase insert failed, kept in-memory copy:", error.message);
  }

  return complaint;
}

/** Fetch a single citizen complaint by ID from Supabase */
async function fetchCitizenComplaintById(id) {
  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    // Fallback to in-memory
    return citizenComplaints.find((c) => c.id === id) || null;
  }
  return data ? rowToComplaint(data) : null;
}

// Directory for uploaded photos
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getCached(key, fetcher) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }
  const data = await fetcher();
  cache.set(key, { data, time: Date.now() });
  return data;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, CORS_HEADERS);
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  res.writeHead(statusCode, CORS_HEADERS);
  res.end(JSON.stringify({ error: message }));
}

// Read the full request body as a Buffer
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Parse multipart/form-data (zero-dependency, Buffer-safe)
function parseMultipart(buffer, boundary) {
  const fields = {};
  const files = {}; // name → array of { filename, data, contentType }
  const delim = Buffer.from(`--${boundary}`);
  let pos = 0;

  while (pos < buffer.length) {
    const start = buffer.indexOf(delim, pos);
    if (start === -1) break;
    const partStart = start + delim.length;
    // Check for closing boundary --
    if (buffer[partStart] === 0x2d && buffer[partStart + 1] === 0x2d) break; // --
    // Skip CRLF after boundary
    const dataStart = partStart + 2; // skip \r\n
    const nextDelim = buffer.indexOf(delim, dataStart);
    if (nextDelim === -1) break;
    // Part content is between dataStart and nextDelim, minus trailing \r\n
    let partEnd = nextDelim;
    if (partEnd >= 2 && buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) {
      partEnd -= 2; // strip trailing \r\n
    }
    const partBuf = buffer.subarray(dataStart, partEnd);
    if (partBuf.length === 0) { pos = nextDelim; continue; }

    // Find header/body separator (\r\n\r\n)
    const sep = partBuf.indexOf("\r\n\r\n");
    if (sep === -1) { pos = nextDelim; continue; }

    const headerText = partBuf.subarray(0, sep).toString();
    const body = partBuf.subarray(sep + 4);

    const nameMatch = headerText.match(/name="([^"]+)"/);
    if (!nameMatch) { pos = nextDelim; continue; }
    const name = nameMatch[1];

    const filenameMatch = headerText.match(/filename="([^"]*)"/);
    if (filenameMatch) {
      const filename = filenameMatch[1];
      if (filename && body.length > 0) {
        const fileEntry = { filename, data: body, contentType: headerText.match(/Content-Type:\s*(\S+)/)?.[1] || "application/octet-stream" };
        if (!files[name]) files[name] = [];
        files[name].push(fileEntry);
      }
    } else {
      fields[name] = body.toString().trim();
    }

    pos = nextDelim;
  }

  return { fields, files };
}

// Create a new citizen complaint
function createCitizenComplaint(fields, photoFiles) {
  citizenCounter++;
  const id = `CIT-${String(citizenCounter).padStart(4, "0")}`;
  const now = new Date().toISOString();

  // Support multiple photos — photoFiles is an array (or null)
  const photoUrls = [];
  const fileList = Array.isArray(photoFiles) ? photoFiles : (photoFiles ? [photoFiles] : []);
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    const ext = f.filename.match(/\.(\w+)$/)?.[1] || "jpg";
    const savedName = fileList.length === 1 ? `${id}.${ext}` : `${id}_${i + 1}.${ext}`;
    const savePath = path.join(UPLOAD_DIR, savedName);
    fs.writeFileSync(savePath, f.data);
    photoUrls.push(`/uploads/${savedName}`);
  }

  const complaint = {
    id,
    address: fields.address || "",
    street: (fields.address || "").split(" ").slice(1).join(" ") || fields.address || "",
    neighborhood: fields.neighborhood || "Unknown",
    complaintText: fields.complaintText || "",
    daysWaiting: 0,
    submittedDate: now,
    status: "Pending",
    latitude: parseFloat(fields.latitude) || 44.6488,
    longitude: parseFloat(fields.longitude) || -63.5752,
    photoUrl: photoUrls.length > 0 ? photoUrls[0] : null,
    photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
    source: "citizen",
  };

  // Persist to Supabase (async, non-blocking — fallback keeps in-memory copy)
  saveCitizenComplaint(complaint);

  // Invalidate complaints cache so the new complaint shows up
  cache.delete("complaints");
  cache.delete("allComplaints");

  return complaint;
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  // Serve uploaded photos
  if (req.url?.startsWith("/uploads/")) {
    const filePath = path.join(UPLOAD_DIR, path.basename(req.url));
    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" }[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" });
      return res.end(data);
    } catch {
      return sendError(res, 404, "Photo not found");
    }
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    // Health check
    if (path === "/api/health") {
      return sendJson(res, 200, {
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "tree-hazard-backend",
      });
    }

    // Get all complaints (enriched with real HRM tree data + citizen submissions)
    if (path === "/api/complaints" && req.method === "GET") {
      const hrmComplaints = await getCached("complaints", () =>
        generateComplaintsFromHRM(20)
      );
      // Fetch citizen complaints from Supabase (falls back to in-memory)
      const citizen = await fetchCitizenComplaints();
      const all = [...citizen, ...hrmComplaints];
      return sendJson(res, 200, { complaints: all, count: all.length });
    }

    // Submit a new citizen complaint
    if (path === "/api/complaints" && req.method === "POST") {
      const body = await readBody(req);
      const contentType = req.headers["content-type"] || "";

      let fields, photoFile;

      if (contentType.startsWith("multipart/form-data")) {
        const boundary = contentType.match(/boundary=(.+)/)?.[1];
        if (!boundary) return sendError(res, 400, "Missing multipart boundary");
        const parsed = parseMultipart(body, boundary);
        fields = parsed.fields;
        photoFile = parsed.files.photos || parsed.files.photo || null;
      } else {
        try {
          fields = JSON.parse(body.toString());
          photoFile = null;
        } catch {
          return sendError(res, 400, "Invalid JSON body");
        }
      }

      // Validate required fields
      if (!fields.address || !fields.address.trim())
        return sendError(res, 400, "Address is required");
      if (!fields.complaintText || fields.complaintText.trim().length < 10)
        return sendError(res, 400, "Complaint text must be at least 10 characters");

      const complaint = createCitizenComplaint(fields, photoFile);

      return sendJson(res, 201, {
        id: complaint.id,
        message: "Complaint submitted successfully",
      });
    }

    // Get single complaint by ID
    const complaintMatch = path.match(/^\/api\/complaints\/(.+)$/);
    if (complaintMatch && req.method === "GET") {
      const id = complaintMatch[1];
      // Check citizen complaints first (Supabase with in-memory fallback)
      const citizen = await fetchCitizenComplaintById(id);
      if (citizen) return sendJson(res, 200, citizen);
      // Then check HRM data
      const hrmComplaints = await getCached("complaints", () =>
        generateComplaintsFromHRM(20)
      );
      const complaint = hrmComplaints.find((c) => c.id === id);
      if (!complaint) return sendError(res, 404, "Complaint not found");
      return sendJson(res, 200, complaint);
    }

    // Get full tree inventory for map
    if (path === "/api/trees") {
      const trees = await getCached("trees", () => getHalifaxTreeInventory());
      return sendJson(res, 200, { trees, count: trees.length });
    }

    // Get recent tree-related 311 calls
    if (path === "/api/311-calls") {
      const calls = await getCached("311-calls", () => fetchTree311Calls(50));
      return sendJson(res, 200, { calls, count: calls.length });
    }

    // Get 311 call statistics
    if (path === "/api/311-stats") {
      const stats = await getCached("311-stats", () => fetchTree311Stats());
      return sendJson(res, 200, stats);
    }

    // Unknown endpoint
    return sendError(res, 404, `Endpoint not found: ${path}`);
  } catch (err) {
    console.error("Server error:", err);
    return sendError(res, 500, err.message);
  }
});

server.listen(PORT, () => {
  console.log(`🌳 Tree Hazard Detection backend running on http://localhost:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/api/health`);
  console.log(`   Complaints: http://localhost:${PORT}/api/complaints`);
  console.log(`   Trees:   http://localhost:${PORT}/api/trees`);
  console.log(`   311 Calls: http://localhost:${PORT}/api/311-calls`);
});
