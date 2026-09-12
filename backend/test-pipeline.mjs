/**
 * Standalone test script — runs the full AI pipeline step by step:
 *   1. Load .env variables
 *   2. Call Llama Parse to extract photo description from image
 *   3. Call GLM-5.2 with complaint text + photo description
 *   4. Print all intermediate results
 *
 * Usage:  node test-pipeline.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describePhoto } from "./src/llamaParseClient.js";
import { analyzeHazard } from "./src/llmClient.js";

// ── Load .env manually (zero-dependency) ──────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] = val;
  }
  console.log("✅ .env loaded");
} else {
  console.error("❌ .env not found at:", envPath);
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────
const PHOTO_PATH = path.join(__dirname, "uploads", "CIT-1003.jpg");
const COMPLAINT_TEXT = "There is a large tree behind my house that is leaning dangerously. I think it could fall on my house at any moment. This is URGENT!!!";

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("  TREE HAZARD DETECTION — FULL PIPELINE TEST");
  console.log("=".repeat(70));

  // Check photo exists
  console.log("\n📁 Photo path:", PHOTO_PATH);
  console.log("   Exists:", fs.existsSync(PHOTO_PATH));
  if (fs.existsSync(PHOTO_PATH)) {
    const stats = fs.statSync(PHOTO_PATH);
    console.log("   Size:", (stats.size / 1024).toFixed(1), "KB");
  }

  // ── STEP 1: Llama Parse — Image to Text ────────────────────────
  console.log("\n" + "─".repeat(70));
  console.log("  STEP 1: Llama Parse — Image-to-Text Extraction");
  console.log("─".repeat(70));

  const llamaKey = process.env.LLAMA_PARSE_API_KEY;
  console.log("   API Key:", llamaKey ? `${llamaKey.slice(0, 8)}...${llamaKey.slice(-4)}` : "NOT SET");

  const t0 = Date.now();
  const photoDescription = await describePhoto(PHOTO_PATH);
  const t1 = Date.now();

  console.log("\n   ⏱  Llama Parse took:", ((t1 - t0) / 1000).toFixed(1), "seconds");
  console.log("\n   📝 Photo Description:");
  console.log("   ", photoDescription || "(null — no description extracted)");

  if (!photoDescription) {
    console.log("\n⚠️  No photo description returned. Continuing with text-only analysis...");
  }

  // ── STEP 2: GLM-5.2 — Hazard Analysis ──────────────────────────
  console.log("\n" + "─".repeat(70));
  console.log("  STEP 2: GLM-5.2 — Hazard Analysis");
  console.log("─".repeat(70));

  const llmKey = process.env.LLM_API_KEY;
  const llmUrl = process.env.LLM_BASE_URL;
  const llmModel = process.env.LLM_MODEL;
  console.log("   Model:", llmModel);
  console.log("   Base URL:", llmUrl);
  console.log("   API Key:", llmKey ? `${llmKey.slice(0, 8)}...${llmKey.slice(-4)}` : "NOT SET");
  console.log("\n   📋 Complaint Text:");
  console.log("   ", COMPLAINT_TEXT);

  const t2 = Date.now();
  let result;
  try {
    result = await analyzeHazard(COMPLAINT_TEXT, PHOTO_PATH);
  } catch (err) {
    console.error("\n❌ GLM-5.2 analysis failed:", err.message);
    process.exit(1);
  }
  const t3 = Date.now();

  console.log("\n   ⏱  GLM-5.2 took:", ((t3 - t2) / 1000).toFixed(1), "seconds");
  console.log("\n   🤖 AI Analysis Result:");
  console.log(JSON.stringify(result, null, 2));

  // ── Summary ────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));
  console.log("   Photo Description:", result.photoDescription || "N/A");
  console.log("   Danger Score:", result.dangerScore, "/ 100");
  console.log("   Hazards:", result.hazards.map(h => h.label).join(", ") || "none");
  console.log("   Text-Image Conflict:", result.textImageConflict);
  console.log("   Is Unsure:", result.isUnsure);
  console.log("   Confidence:", result.confidence);
  console.log("   Reasoning:", result.reasoning);
  console.log("   Total Time:", ((t3 - t0) / 1000).toFixed(1), "seconds");
  console.log("=".repeat(70) + "\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
