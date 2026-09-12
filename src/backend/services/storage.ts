import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Complaint photos live on disk, outside the web root, and are served through
 * `/api/images/[id]` rather than as static files. That keeps an access check in
 * front of them for when the admin console gets a real auth gate.
 */

export const UPLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR ?? "var/uploads"
);

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/svg+xml": ".svg",
};

export const ACCEPTED_MIME_TYPES = Object.keys(EXTENSION_BY_MIME);
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function ensureUploadDir(): void {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function extensionFor(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? ".bin";
}

export function newImageId(): string {
  return crypto.randomUUID();
}

/** Filenames are derived from the generated id, never from user input. */
export function filenameFor(imageId: string, mimeType: string): string {
  return `${imageId}${extensionFor(mimeType)}`;
}

export function pathFor(filename: string): string {
  // Defence in depth: a stored filename should never escape the upload dir.
  const resolved = path.resolve(UPLOAD_DIR, path.basename(filename));
  if (!resolved.startsWith(UPLOAD_DIR)) {
    throw new Error("Refusing to resolve a path outside the upload directory");
  }
  return resolved;
}

export async function writeImage(
  filename: string,
  data: Buffer | Uint8Array
): Promise<void> {
  ensureUploadDir();
  await fsp.writeFile(pathFor(filename), data);
}

export async function readImage(filename: string): Promise<Buffer | null> {
  try {
    return await fsp.readFile(pathFor(filename));
  } catch {
    return null;
  }
}

export async function deleteImage(filename: string): Promise<void> {
  try {
    await fsp.unlink(pathFor(filename));
  } catch {
    // Already gone; nothing to do.
  }
}
