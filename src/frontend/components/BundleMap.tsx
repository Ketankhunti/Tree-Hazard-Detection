import { formatDistance } from "@/shared/geo";
import type { PriorityLevel, ScoredRequest } from "@/shared/types";

/**
 * Operations map.
 *
 * Bundling is inherently spatial - a table cannot show why three jobs belong
 * together - but a real tile service would add a network dependency and an API
 * key to a tool that otherwise runs entirely offline. So this projects the
 * actual coordinates into an SVG instead: no tiles, no key, no requests.
 *
 * It is a relative-position plot, not a street map. That is the honest thing
 * to render given the gazetteer only knows street centroids anyway, and it
 * answers the only question being asked here: which of these jobs are close
 * enough to do together?
 */

const VIEW_WIDTH = 560;
const VIEW_HEIGHT = 360;
const PADDING = 34;

const PRIORITY_FILL: Record<PriorityLevel, string> = {
  Critical: "#dc2626",
  High: "#f97316",
  Medium: "#fbbf24",
  Low: "#94a3b8",
};

interface Placed {
  request: ScoredRequest;
  x: number;
  y: number;
}

/**
 * Equirectangular projection with a cosine correction on longitude, so that a
 * metre east and a metre north occupy the same number of pixels. Without it,
 * Halifax renders horizontally stretched by about 30% and distances read wrong.
 */
function project(
  points: ScoredRequest[],
  anchor: ScoredRequest
): { placed: Placed[]; metersPerPixel: number } | null {
  const located = points.filter(
    (p): p is ScoredRequest & { latitude: number; longitude: number } =>
      p.latitude !== null && p.longitude !== null
  );
  if (located.length === 0 || anchor.latitude === null) return null;

  const cosLat = Math.cos((anchor.latitude * Math.PI) / 180);
  const xs = located.map((p) => p.longitude * cosLat);
  const ys = located.map((p) => p.latitude);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Degenerate case: every point at the same spot.
  const spanX = maxX - minX || 0.0008;
  const spanY = maxY - minY || 0.0008;

  const usableWidth = VIEW_WIDTH - PADDING * 2;
  const usableHeight = VIEW_HEIGHT - PADDING * 2;

  // One scale for both axes preserves shape.
  const scale = Math.min(usableWidth / spanX, usableHeight / spanY);

  const offsetX = (VIEW_WIDTH - spanX * scale) / 2;
  const offsetY = (VIEW_HEIGHT - spanY * scale) / 2;

  const placed = located.map((request) => ({
    request,
    x: offsetX + (request.longitude * cosLat - minX) * scale,
    // SVG y grows downward; latitude grows north.
    y: offsetY + (maxY - request.latitude) * scale,
  }));

  // 1 degree of latitude is ~111_320 m.
  const metersPerPixel = 111_320 / scale;

  return { placed, metersPerPixel };
}

export function BundleMap({
  anchor,
  bundled,
  followUp,
  others,
}: {
  anchor: ScoredRequest;
  bundled: ScoredRequest[];
  /** Recommended but outside today's remaining hours. */
  followUp: ScoredRequest[];
  others: ScoredRequest[];
}) {
  const bundledIds = new Set(bundled.map((r) => r.id));
  const followUpIds = new Set(followUp.map((r) => r.id));
  const all = [anchor, ...bundled, ...followUp, ...others];
  const projection = project(all, anchor);

  if (!projection) {
    return (
      <div className="flex aspect-[14/9] items-center justify-center border border-slate-200 bg-slate-50">
        <p className="text-sm text-slate-500">
          No coordinates available to map.
        </p>
      </div>
    );
  }

  const { placed, metersPerPixel } = projection;
  const byId = new Map(placed.map((p) => [p.request.id, p]));
  const anchorPoint = byId.get(anchor.id);

  // Scale bar: pick a round distance that lands near 100px.
  const targetMeters = 100 * metersPerPixel;
  const step = [100, 200, 250, 500, 1000, 2000].reduce((best, value) =>
    Math.abs(value - targetMeters) < Math.abs(best - targetMeters) ? value : best
  );
  const barPixels = step / metersPerPixel;

  return (
    <figure className="border border-slate-200 bg-white">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="block w-full"
        role="img"
        aria-label={`Map of ${anchor.address} and ${bundled.length} nearby requests`}
      >
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#f8fafc" />

        {/* Reference grid. Cosmetic - conveys scale, not streets. */}
        <g stroke="#e2e8f0" strokeWidth="1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={(VIEW_HEIGHT / 5) * i}
              x2={VIEW_WIDTH}
              y2={(VIEW_HEIGHT / 5) * i}
            />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <line
              key={`v${i}`}
              x1={(VIEW_WIDTH / 7) * i}
              y1={0}
              x2={(VIEW_WIDTH / 7) * i}
              y2={VIEW_HEIGHT}
            />
          ))}
        </g>

        {/* Routes from the anchor to each bundled job. */}
        {anchorPoint &&
          bundled.map((request) => {
            const point = byId.get(request.id);
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
                opacity="0.5"
              />
            );
          })}

        {/* Out-of-plan requests, faint. */}
        {placed
          .filter(
            (p) =>
              p.request.id !== anchor.id &&
              !bundledIds.has(p.request.id) &&
              !followUpIds.has(p.request.id)
          )
          .map((p) => (
            <circle
              key={p.request.id}
              cx={p.x}
              cy={p.y}
              r={4}
              fill={PRIORITY_FILL[p.request.assessment.priority]}
              opacity="0.28"
            />
          ))}

        {/* Recommended but not scheduled today: hollow rings. */}
        {followUp.map((request) => {
          const point = byId.get(request.id);
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

        {/* Bundled jobs. */}
        {bundled.map((request, index) => {
          const point = byId.get(request.id);
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
              opacity="0.45"
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

        {/* Scale bar. */}
        <g transform={`translate(${PADDING}, ${VIEW_HEIGHT - 18})`}>
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
          Relative positions, not a street map
        </span>
      </figcaption>
    </figure>
  );
}
