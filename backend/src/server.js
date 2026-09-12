/**
 * Tree Hazard Detection Backend Server
 *
 * Zero-dependency HTTP server using Node.js built-in http module.
 * Serves real HRM Open Data to the frontend.
 *
 * Endpoints:
 *   GET /api/complaints          — enriched complaints from real HRM tree data
 *   GET /api/complaints/:id      — single complaint by ID
 *   GET /api/trees               — full Halifax tree inventory (for map)
 *   GET /api/311-calls           — recent tree-related 311 calls
 *   GET /api/311-stats           — 311 call statistics
 *   GET /api/health              — health check
 */

import http from "node:http";
import { URL } from "node:url";
import {
  fetchTree311Calls,
  fetchTree311Stats,
} from "./hrmApi.js";
import {
  generateComplaintsFromHRM,
  getHalifaxTreeInventory,
} from "./complaintGenerator.js";

const PORT = process.env.PORT || 3001;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

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

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
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

    // Get all complaints (enriched with real HRM tree data)
    if (path === "/api/complaints") {
      const complaints = await getCached("complaints", () =>
        generateComplaintsFromHRM(20)
      );
      return sendJson(res, 200, { complaints, count: complaints.length });
    }

    // Get single complaint by ID
    const complaintMatch = path.match(/^\/api\/complaints\/(.+)$/);
    if (complaintMatch) {
      const id = complaintMatch[1];
      const complaints = await getCached("complaints", () =>
        generateComplaintsFromHRM(20)
      );
      const complaint = complaints.find((c) => c.id === id);
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
