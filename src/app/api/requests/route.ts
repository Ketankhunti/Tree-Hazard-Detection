import { NextResponse } from "next/server";

import { resolveImageMime } from "@/backend/services/image-mime";
import {
  submissionSchema,
  submitRequest,
  validatePhoto,
  type SubmittedPhoto,
} from "@/backend/services/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision analysis on a large photo can take a while.
export const maxDuration = 60;

/** Public intake endpoint. Accepts multipart/form-data with an optional photo. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form submission." },
      { status: 400 }
    );
  }

  const parsed = submissionSchema.safeParse({
    reporterName: form.get("reporterName"),
    reporterEmail: form.get("reporterEmail"),
    address: form.get("address"),
    description: form.get("description"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Some details need fixing.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  let photo: SubmittedPhoto | null = null;
  const file = form.get("photo");
  if (file instanceof File && file.size > 0) {
    const data = Buffer.from(await file.arrayBuffer());
    photo = {
      data,
      mimeType: resolveImageMime(file.type, data),
      originalName: file.name,
    };
    const problem = validatePhoto(photo);
    if (problem) {
      return NextResponse.json(
        { error: problem, fieldErrors: { photo: [problem] } },
        { status: 400 }
      );
    }
  }

  try {
    const result = await submitRequest(parsed.data, photo);
    return NextResponse.json(
      {
        reference: result.reference,
        id: result.id,
        status: result.status,
        linkedTo: result.linkedTo,
        photoAnalyzed: result.photoAnalyzed,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Submission failed", error);
    return NextResponse.json(
      { error: "Could not record the request. Please try again." },
      { status: 500 }
    );
  }
}
