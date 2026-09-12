/**
 * Generated stand-in photos for seeded requests.
 *
 * Real JPEGs in `seed-photos/<fixture-id>.jpg` would be better; until then this
 * SVG exercises storage -> serve without checking binary fixtures into git.
 */

export const PLACEHOLDER_MIME = "image/svg+xml";

export function placeholderPhotoSvg(input: {
  reference: string;
  address: string;
  /** Completed requests render a grey tree. */
  muted?: boolean;
}): string {
  const tone = input.muted ? "#64748b" : "#3f6212";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#e2e8f0"/>
  <rect x="0" y="430" width="800" height="170" fill="#cbd5e1"/>
  <rect x="360" y="240" width="46" height="210" fill="#78716c"/>
  <circle cx="383" cy="210" r="118" fill="${tone}" opacity="0.85"/>
  <circle cx="300" cy="250" r="78" fill="${tone}" opacity="0.7"/>
  <circle cx="470" cy="252" r="84" fill="${tone}" opacity="0.75"/>
  <text x="400" y="527" font-family="monospace" font-size="26" fill="#475569" text-anchor="middle">${escapeXml(input.reference)}</text>
  <text x="400" y="561" font-family="sans-serif" font-size="20" fill="#64748b" text-anchor="middle">${escapeXml(input.address)}</text>
  <text x="400" y="586" font-family="sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">placeholder - no field photo supplied</text>
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
