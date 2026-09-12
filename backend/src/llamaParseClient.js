/**
 * Llama Parse Client — Image-to-text extraction
 *
 * Zero-dependency: uses Node 18+ built-in fetch.
 * Uploads a photo to Llama Parse, polls for completion, and extracts
 * the image description from the markdown result.
 *
 * API flow:
 *   1. POST /api/v1/parsing/upload  (multipart) → { id, status: "PENDING" }
 *   2. GET  /api/v1/parsing/job/{id}             → { status: "SUCCESS" }
 *   3. GET  /api/v1/parsing/job/{id}/result/markdown → { markdown: "..." }
 *
 * The markdown result contains an image description like:
 *   "\n\n# Image\n\nBroken tree trunk lying on the ground in a forest setting."
 */

import fs from "node:fs";
import path from "node:path";

const LLAMA_PARSE_BASE = "https://api.cloud.llamaindex.ai";

/**
 * Extract a text description from a photo using Llama Parse.
 *
 * @param {string} photoPath — absolute path to the photo file
 * @returns {Promise<string|null>} — image description text, or null on failure
 */
export async function describePhoto(photoPath) {
  const apiKey = process.env.LLAMA_PARSE_API_KEY;
  if (!apiKey) {
    console.warn("[LlamaParse] LLAMA_PARSE_API_KEY not set, skipping photo description");
    return null;
  }

  if (!photoPath || !fs.existsSync(photoPath)) {
    console.warn("[LlamaParse] Photo path not found:", photoPath);
    return null;
  }

  try {
    // Step 1: Upload the photo
    console.log("[LlamaParse] Uploading photo for description…");
    const fileBuffer = fs.readFileSync(photoPath);
    const filename = path.basename(photoPath);
    const ext = path.extname(photoPath).toLowerCase();
    const mime =
      ext === ".png" ? "image/png" :
      ext === ".gif" ? "image/gif" :
      ext === ".webp" ? "image/webp" :
      "image/jpeg";

    // Build multipart/form-data manually (zero-dependency)
    const boundary = "llama-parse-" + Math.random().toString(36).slice(2);
    const parts = [];

    // file part
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${mime}\r\n\r\n`
      )
    );
    parts.push(fileBuffer);
    parts.push(Buffer.from("\r\n"));

    // language part
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `en\r\n`
      )
    );

    // close boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const uploadRes = await fetch(`${LLAMA_PARSE_BASE}/api/v1/parsing/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(30000),
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      console.error("[LlamaParse] Upload failed:", uploadRes.status, errText.slice(0, 200));
      return null;
    }

    const uploadData = await uploadRes.json();
    const jobId = uploadData.id;
    if (!jobId) {
      console.error("[LlamaParse] No job ID returned");
      return null;
    }

    console.log(`[LlamaParse] Job created: ${jobId}, polling for result…`);

    // Step 2: Poll for completion (max ~60 seconds)
    const maxAttempts = 30;
    const pollInterval = 2000; // 2 seconds
    let status = "PENDING";

    for (let i = 0; i < maxAttempts; i++) {
      await sleep(pollInterval);
      const statusRes = await fetch(`${LLAMA_PARSE_BASE}/api/v1/parsing/job/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });

      if (!statusRes.ok) {
        console.warn(`[LlamaParse] Poll ${i + 1} failed: ${statusRes.status}`);
        continue;
      }

      const statusData = await statusRes.json();
      status = statusData.status;

      if (status === "SUCCESS") {
        break;
      }
      if (status === "ERROR" || status === "FAILED") {
        console.error("[LlamaParse] Job failed:", statusData.error_message);
        return null;
      }
      // Still PENDING — keep polling
    }

    if (status !== "SUCCESS") {
      console.error(`[LlamaParse] Job timed out (status=${status} after ${maxAttempts * pollInterval / 1000}s)`);
      return null;
    }

    // Step 3: Get the markdown result (contains image description)
    const mdRes = await fetch(`${LLAMA_PARSE_BASE}/api/v1/parsing/job/${jobId}/result/markdown`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!mdRes.ok) {
      console.error("[LlamaParse] Failed to get markdown result:", mdRes.status);
      return null;
    }

    const mdData = await mdRes.json();
    const markdown = mdData.markdown || "";

    // Extract the image description from the markdown
    // Format: "\n\n# Image\n\n<description>" or just the text content
    const description = extractImageDescription(markdown);

    if (!description || description === "NO_CONTENT_HERE") {
      console.warn("[LlamaParse] No description extracted from markdown");
      return null;
    }

    console.log(`[LlamaParse] Photo description: "${description}"`);
    return description;
  } catch (err) {
    console.error("[LlamaParse] Error:", err.message);
    return null;
  }
}

/**
 * Extract the image description from Llama Parse markdown output.
 * The markdown typically looks like:
 *   "\n\n# Image\n\nBroken tree trunk lying on the ground in a forest setting."
 * Or sometimes just plain text.
 */
function extractImageDescription(markdown) {
  if (!markdown || typeof markdown !== "string") return null;

  // Try to extract text after "# Image" header
  const imageHeaderMatch = markdown.match(/# Image\s*\n+(.*)/i);
  if (imageHeaderMatch) {
    return imageHeaderMatch[1].trim();
  }

  // Otherwise, strip markdown headers and return the text content
  const cleaned = markdown
    .replace(/^#+\s+/gm, "")  // remove headers
    .replace(/\n{2,}/g, " ")  // collapse newlines
    .trim();

  return cleaned || null;
}

/** Simple sleep helper */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
