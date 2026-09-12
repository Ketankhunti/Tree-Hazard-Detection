import { formatDistance } from "@/shared/geo";
import {
  BUNDLE_MAP,
  fitViewport,
  hasCoordinates,
  metersPerPixel,
  toPixel,
} from "@/shared/map";
import type { MapViewport, StaticMapImage } from "@/shared/map";
import type { PriorityLevel, ScoredRequest } from "@/shared/types";

/**
 * Operations map.
 *
 * Bundling is inherently spatial - a table cannot show why three jobs belong
 * together. A Google Static Maps raster supplies the streets and the markers are
 * drawn over it here, because the symbology is the point: priority colour,
 * driving order, and which jobs are today versus a follow-up trip. Google's own
 * marker parameters cannot express that.
 *
 * `basemap` is null when no API key is configured. The map then degrades to the
 * bare coordinate plot it used to be - still correctly scaled, just without
 * streets underneath.
 */

const PRIORITY_FILL: Record<PriorityLevel, string> = {
  Critical: "#dc2626",
  High: "#f97316",
  Medium: "#fbbf24",
  Low: "#94a3b8",
};

/** Keeps a marker that is only just off-frame from being clipped mid-glyph. */
const EDGE_MARGIN = 6;

export function BundleMap({
  anchor,
  bundled,
  followUp,
  others,
  basemap,
}: {
  anchor: ScoredRequest;
  bundled: ScoredRequest[];
  /** Recommended but outside today's remaining hours. */
  followUp: ScoredRequest[];
  others: ScoredRequest[];
  /** Signed Google basemap from the server, or null when unavailable. */
  basemap: StaticMapImage | null;
}) {
  // The view is fitted to the plan, not to every open request in the city: a
  // report across the harbour would zoom the cluster down to a single dot.
  const planned = [anchor, ...bundled, ...followUp];
  const viewport: MapViewport | null =
    basemap?.viewport ?? fitViewport(planned, BUNDLE_MAP);

  if (!viewport) {
    return (
      <div className="flex aspect-[14/9] items-center justify-center border border-slate-200 bg-slate-50">
        <p className="text-sm text-slate-500">No coordinates available to map.</p>
      </div>
    );
  }

  const { width, height } = viewport;
  const place = (request: ScoredRequest) =>
    hasCoordinates(request) ? toPixel(viewport, request) : null;

  const inFrame = (point: { x: number; y: number }) =>
    point.x >= -EDGE_MARGIN &&
    point.x <= width + EDGE_MARGIN &&
    point.y >= -EDGE_MARGIN &&
    point.y <= height + EDGE_MARGIN;

  const anchorPoint = place(anchor);
  const bundledIds = new Set(bundled.map((r) => r.id));
  const followUpIds = new Set(followUp.map((r) => r.id));

  // Context pins, drawn only where they actually fall inside the fitted view.
  const context = others.flatMap((request) => {
    if (request.id === anchor.id) return [];
    if (bundledIds.has(request.id) || followUpIds.has(request.id)) return [];
    const point = place(request);
    return point && inFrame(point) ? [{ request, point }] : [];
  });

  // Scale bar: round distance landing nearest 100px of the rendered image.
  const resolution = metersPerPixel(viewport);
  const step = [50, 100, 200, 250, 500, 1000, 2000].reduce((best, value) =>
    Math.abs(value - 100 * resolution) < Math.abs(best - 100 * resolution)
      ? value
      : best
  );
  const barPixels = step / resolution;

  return (
    <figure className="border border-slate-200 bg-white">
      <div
        className="relative w-full overflow-hidden bg-slate-50"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {basemap ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={basemap.src}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Map of ${anchor.address} and ${bundled.length} nearby requests`}
        >
          {/* Offline fallback backdrop: conveys scale, not streets. */}
          {!basemap && (
            <g stroke="#e2e8f0" strokeWidth="1">
              <rect width={width} height={height} fill="#f8fafc" stroke="none" />
              {[1, 2, 3, 4].map((i) => (
                <line
                  key={`h${i}`}
                  x1={0}
                  y1={(height / 5) * i}
                  x2={width}
                  y2={(height / 5) * i}
                />
              ))}
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <line
                  key={`v${i}`}
                  x1={(width / 7) * i}
                  y1={0}
                  x2={(width / 7) * i}
                  y2={height}
                />
              ))}
            </g>
          )}

          {/* Routes from the anchor to each bundled job. */}
          {anchorPoint &&
            bundled.map((request) => {
              const point = place(request);
              if (!point) return null;
              return (
                <line
                  key={`route-${request.id}`}
                  x1={anchorPoint.x}
                  y1={anchorPoint.y}
                  x2={point.x}
                  y2={point.y}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity="0.55"
                />
              );
            })}

          {/* Out-of-plan requests, faint. */}
          {context.map(({ request, point }) => (
            <circle
              key={request.id}
              cx={point.x}
              cy={point.y}
              r={4}
              fill={PRIORITY_FILL[request.assessment.priority]}
              stroke="#ffffff"
              strokeWidth="1"
              opacity="0.45"
            />
          ))}

          {/* Recommended but not scheduled today: hollow rings. */}
          {followUp.map((request) => {
            const point = place(request);
            if (!point) return null;
            return (
              <circle
                key={`followup-${request.id}`}
                cx={point.x}
                cy={point.y}
                r={7}
                fill="#ffffff"
                stroke={PRIORITY_FILL[request.assessment.priority]}
                strokeWidth="2.5"
                strokeDasharray="3 2"
              />
            );
          })}

          {/* Bundled jobs, numbered in driving order. */}
          {bundled.map((request, index) => {
            const point = place(request);
            if (!point) return null;
            return (
              <g key={request.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={9}
                  fill={PRIORITY_FILL[request.assessment.priority]}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
                <text
                  x={point.x}
                  y={point.y + 3.5}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="#0f172a"
                >
                  {index + 1}
                </text>
              </g>
            );
          })}

          {/* Anchor, drawn last so it sits on top. */}
          {anchorPoint && (
            <g>
              <circle
                cx={anchorPoint.x}
                cy={anchorPoint.y}
                r={15}
                fill="none"
                stroke="#dc2626"
                strokeWidth="1.5"
                opacity="0.55"
              />
              <circle
                cx={anchorPoint.x}
                cy={anchorPoint.y}
                r={8}
                fill="#dc2626"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
            </g>
          )}

          {/* Scale bar, top-left: Google's logo and attribution own the bottom
              edge of the raster and must not be covered. */}
          <g transform={`translate(16, 22)`}>
            <rect
              x={-8}
              y={-11}
              width={barPixels + 58}
              height={21}
              fill="#ffffff"
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <line x1={0} y1={0} x2={barPixels} y2={0} stroke="#475569" strokeWidth="2" />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="#475569" strokeWidth="2" />
            <line
              x1={barPixels}
              y1={-4}
              x2={barPixels}
              y2={4}
              stroke="#475569"
              strokeWidth="2"
            />
            <text x={barPixels + 7} y={4} fontSize="11" fill="#475569">
              {formatDistance(step)}
            </text>
          </g>
        </svg>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-red-600/30" />
          Anchor job
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-slate-900 bg-amber-400" />
          Recommended (numbered by driving order)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed border-slate-500 bg-white" />
          Follow-up trip
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400 opacity-40" />
          Other open requests
        </span>
        <span className="ml-auto text-slate-400">
          {basemap
            ? "Pins are triage positions, not survey points"
            : "Relative positions, not a street map"}
        </span>
      </figcaption>
    </figure>
  );
}
