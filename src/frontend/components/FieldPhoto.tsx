"use client";

import { useState } from "react";
import { Download, ImageOff } from "lucide-react";

import type { RequestImage } from "@/shared/types";

function isHeic(image: RequestImage): boolean {
  return (
    image.mimeType === "image/heic" ||
    image.mimeType === "image/heif" ||
    image.filename.toLowerCase().endsWith(".heic")
  );
}

/**
 * Resident-submitted photo on the detail page.
 *
 * JPEG/PNG/WebP/SVG preview in the browser; HEIC is stored but most browsers
 * cannot render it inline, so we offer a download instead.
 */
export function FieldPhoto({
  image,
  reference,
}: {
  image: RequestImage;
  reference: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = `/api/images/${image.id}`;

  if (isHeic(image)) {
    return (
      <div className="border border-slate-200 bg-slate-50 px-3 py-4">
        <p className="text-sm text-slate-700">
          This photo is in HEIC format (common on iPhones). Your browser cannot
          preview it here, but the file is on record.
        </p>
        <a
          href={src}
          download={`${reference}-photo.heic`}
          className="mt-3 inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download photo
        </a>
      </div>
    );
  }

  if (broken) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
        <ImageOff className="h-8 w-8 text-slate-400" aria-hidden />
        <p className="text-sm font-medium text-slate-600">Photo unavailable</p>
        <p className="text-xs text-slate-500">
          The record exists but the file is missing from storage. Run{" "}
          <span className="font-mono">npm run db:reset</span> locally, or
          re-submit the photo.
        </p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Photo submitted for ${reference}`}
      className="max-h-[min(420px,55vh)] w-full border border-slate-200 bg-slate-100 object-contain"
      onError={() => setBroken(true)}
    />
  );
}
