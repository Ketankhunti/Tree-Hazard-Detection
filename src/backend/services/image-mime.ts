/**
 * Browser file inputs often leave `type` empty (Windows) or wrong. Sniffing the
 * magic bytes keeps uploads storable and displayable under the correct MIME.
 */

const ACCEPTED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/svg+xml",
]);

export function sniffImageMime(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image/webp";
  }
  if (data.length >= 12 && data.toString("ascii", 4, 8) === "ftyp") {
    const brand = data.toString("ascii", 8, 12).toLowerCase();
    if (brand.startsWith("heic") || brand.startsWith("heif") || brand === "mif1") {
      return "image/heic";
    }
  }
  const head = data.subarray(0, 256).toString("utf8").trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) {
    return "image/svg+xml";
  }
  return null;
}

/** Prefer a sniffed type when the browser did not send a useful one. */
export function resolveImageMime(declared: string, data: Buffer): string {
  const trimmed = declared.trim().toLowerCase();
  if (trimmed && ACCEPTED.has(trimmed)) return trimmed;
  return sniffImageMime(data) ?? trimmed ?? "application/octet-stream";
}

/** Most browsers cannot render HEIC inside an &lt;img&gt; tag. */
export function isHeicMime(mimeType: string): boolean {
  return mimeType === "image/heic" || mimeType === "image/heif";
}
