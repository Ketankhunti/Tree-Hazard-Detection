import { NextResponse } from "next/server";

import { hasLLM } from "@/backend/config";
import {
  listAllRequests,
  getImages,
  saveClassification,
} from "@/backend/db/repository";

import {
  analyzeHazard,
  aiResultToClassification,
} from "@/backend/services/llmClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/analyze-all
 *
 * Triggers batch AI analysis for all requests that don't yet have an
 * AI-derived classification (source = "fused" or "image"). Processes 3
 * requests concurrently in the background and returns immediately with
 * counts so the UI can poll /api/requests for live progress.
 */
export async function POST() {
  if (!hasLLM()) {
    return NextResponse.json(
      { error: "LLM pipeline is not configured. Set LLM_API_KEY." },
      { status: 503 }
    );
  }

  const all = await listAllRequests();

  // Filter to requests that don't have an AI-derived classification yet.
  // The `source` field on the assessment is "text" for text-only, "fused"
  // when the LLM pipeline ran, or "image" when only the photo was analyzed.
  const pending = all.filter(
    (r) =>
      r.assessment.source !== "fused" &&
      r.assessment.source !== "image"
  );

  // Fire and forget — process in the background
  processBatch(pending).catch((err) =>
    console.error("[AI Batch] Fatal error:", err)
  );

  return NextResponse.json({
    message: "Batch analysis started",
    total: all.length,
    pending: pending.length,
    alreadyCached: all.length - pending.length,
  });
}

/** Process requests 3 at a time. */
async function processBatch(
  requests: { id: string; description: string }[]
): Promise<void> {
  const CONCURRENCY = 3;
  let index = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (index < requests.length) {
      const current = requests[index++];
      try {
        // Fetch the photo for this request
        const images = await getImages(current.id);
        let photoBuffer: Buffer | null = null;
        let mimeType: string | null = null;

        if (images.length > 0 && images[0].data) {
          photoBuffer = Buffer.from(images[0].data, "base64");
          mimeType = images[0].mimeType;
        }

        const result = await analyzeHazard(
          current.description,
          photoBuffer,
          mimeType
        );

        const classification = aiResultToClassification(result);
        await saveClassification(current.id, classification);

        done++;
        console.log(
          `[AI Batch] ${done}/${requests.length} — ${current.id} dangerScore=${result.dangerScore}`
        );
      } catch (err) {
        done++;
        console.error(
          `[AI Batch] Failed for ${current.id}:`,
          (err as Error).message
        );
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  console.log(`[AI Batch] Complete — ${done} processed`);
}
