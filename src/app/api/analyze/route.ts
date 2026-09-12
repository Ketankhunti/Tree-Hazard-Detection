import { NextResponse } from "next/server";

import { hasLLM } from "@/backend/config";
import { getRequest, getImages, saveClassification } from "@/backend/db/repository";
import { readImage } from "@/backend/services/storage";
import {
  analyzeHazard,
  aiResultToClassification,
} from "@/backend/services/llmClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/analyze?id=<requestId>
 *
 * Runs the GLM-5.2 + Llama Parse AI analysis pipeline on a single request.
 * If the request has a photo, Llama Parse extracts a description first, then
 * GLM-5.2 analyzes the text + photo description together.
 *
 * The result is persisted to the assessments table, replacing the previous
 * classification.
 */
export async function POST(request: Request) {
  if (!hasLLM()) {
    return NextResponse.json(
      { error: "LLM pipeline is not configured. Set LLM_API_KEY." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Missing 'id' query parameter." },
      { status: 400 }
    );
  }

  const req = await getRequest(id);
  if (!req) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  // Fetch the first image for this request (if any)
  const images = await getImages(req.id);
  let photoBuffer: Buffer | null = null;
  let mimeType: string | null = null;

  if (images.length > 0) {
    const bytes = await readImage(images[0].filename);
    if (bytes) {
      photoBuffer = bytes;
      mimeType = images[0].mimeType;
    }
  }

  try {
    const result = await analyzeHazard(
      req.description,
      photoBuffer,
      mimeType
    );

    // Persist the AI classification
    const classification = aiResultToClassification(result);
    await saveClassification(req.id, classification);

    return NextResponse.json({
      requestId: req.id,
      reference: req.reference,
      dangerScore: result.dangerScore,
      hazards: result.hazards,
      isUnsure: result.isUnsure,
      textImageConflict: result.textImageConflict,
      confidence: result.confidence,
      reasoning: result.reasoning,
      hasImage: result.hasImage,
      photoDescription: result.photoDescription,
    });
  } catch (err) {
    console.error("[Analyze] Failed:", err);
    return NextResponse.json(
      { error: `AI analysis failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
