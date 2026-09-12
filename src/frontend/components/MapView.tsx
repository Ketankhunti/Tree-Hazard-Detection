"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

import type { ScoredRequest } from "@/shared/types";

/**
 * Interactive queue map from OpenStreetMap raster tiles.
 *
 * No API key and no server proxy: the dashboard can show real streets even when
 * Google Maps is unconfigured. Markers use the same priority palette as the
 * rest of the admin UI.
 */

const TILE_SIZE = 256;
const MIN_ZOOM = 11;
const MAX_ZOOM = 17;
const DEFAULT_CENTER = { latitude: 44.6488, longitude: -63.5752 };

type MapRequest = Pick<
  ScoredRequest,
  | "id"
  | "reference"
  | "address"
  | "neighborhood"
  | "latitude"
  | "longitude"
  | "locationSource"
  | "assessment"
>;

interface ProjectedPoint {
  x: number;
  y: number;
}

interface MappableRequest extends MapRequest {
  latitude: number;
  longitude: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lngLatToWorld(
  latitude: number,
  longitude: number,
  zoom: number
): ProjectedPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const sinLat = Math.sin((latitude * Math.PI) / 180);
  const x = ((longitude + 180) / 360) * scale;
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldToTile(point: ProjectedPoint) {
  return {
    x: Math.floor(point.x / TILE_SIZE),
    y: Math.floor(point.y / TILE_SIZE),
  };
}

function wrapTileX(x: number, zoom: number) {
  const limit = 2 ** zoom;
  return ((x % limit) + limit) % limit;
}

function priorityClasses(priority: ScoredRequest["assessment"]["priority"]) {
  switch (priority) {
    case "Critical":
      return "border-red-950 bg-red-600 text-white";
    case "High":
      return "border-orange-950 bg-orange-500 text-white";
    case "Medium":
      return "border-yellow-900 bg-yellow-300 text-yellow-950";
    case "Low":
    default:
      return "border-emerald-950 bg-emerald-500 text-white";
  }
}

function getMappableRequests(requests: MapRequest[]): MappableRequest[] {
  return requests.filter(
    (request): request is MappableRequest =>
      typeof request.latitude === "number" &&
      typeof request.longitude === "number"
  );
}

function getCenter(points: MappableRequest[]) {
  if (points.length === 0) return DEFAULT_CENTER;

  return {
    latitude:
      points.reduce((sum, request) => sum + request.latitude, 0) / points.length,
    longitude:
      points.reduce((sum, request) => sum + request.longitude, 0) / points.length,
  };
}

function getFittedZoom(
  points: MappableRequest[],
  width: number,
  height: number
) {
  if (points.length <= 1 || width === 0 || height === 0) return 15;

  const padding = 86;
  const usableWidth = Math.max(width - padding * 2, 180);
  const usableHeight = Math.max(height - padding * 2, 140);

  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const projected = points.map((request) =>
      lngLatToWorld(request.latitude, request.longitude, zoom)
    );
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);

    if (spanX <= usableWidth && spanY <= usableHeight) {
      return zoom;
    }
  }

  return MIN_ZOOM;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

export function MapView({
  requests,
  selectedId,
  className = "",
  onSelect,
}: {
  requests: MapRequest[];
  selectedId?: string;
  className?: string;
  onSelect?: (request: MapRequest) => void;
}) {
  const [mapRef, size] = useElementSize<HTMLDivElement>();
  const [zoomOffset, setZoomOffset] = useState(0);
  const mappableRequests = useMemo(() => getMappableRequests(requests), [requests]);
  const center = useMemo(() => getCenter(mappableRequests), [mappableRequests]);
  const fittedZoom = useMemo(
    () => getFittedZoom(mappableRequests, size.width, size.height),
    [mappableRequests, size.height, size.width]
  );
  const zoom = clamp(fittedZoom + zoomOffset, MIN_ZOOM, MAX_ZOOM);

  useEffect(() => {
    setZoomOffset(0);
  }, [requests]);

  const centerPoint = lngLatToWorld(center.latitude, center.longitude, zoom);
  const topLeft = {
    x: centerPoint.x - size.width / 2,
    y: centerPoint.y - size.height / 2,
  };
  const startTile = worldToTile(topLeft);
  const endTile = worldToTile({
    x: topLeft.x + size.width,
    y: topLeft.y + size.height,
  });
  const maxTile = 2 ** zoom - 1;
  const tiles = [];

  for (let x = startTile.x; x <= endTile.x; x += 1) {
    for (
      let y = clamp(startTile.y, 0, maxTile);
      y <= clamp(endTile.y, 0, maxTile);
      y += 1
    ) {
      tiles.push({
        key: `${zoom}-${x}-${y}`,
        x,
        y,
        left: x * TILE_SIZE - topLeft.x,
        top: y * TILE_SIZE - topLeft.y,
      });
    }
  }

  if (mappableRequests.length === 0) {
    return (
      <div
        className={`flex min-h-[260px] items-center justify-center border border-slate-200 bg-slate-50 ${className}`}
      >
        <p className="text-sm font-medium text-slate-500">
          No mappable coordinates available
        </p>
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      className={`relative min-h-[260px] overflow-hidden border border-slate-200 bg-slate-100 ${className}`}
    >
      {size.width > 0 &&
        tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={`https://tile.openstreetmap.org/${zoom}/${wrapTileX(
              tile.x,
              zoom
            )}/${tile.y}.png`}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute h-64 w-64 select-none"
            style={{
              left: tile.left,
              top: tile.top,
            }}
          />
        ))}

      {mappableRequests.map((request) => {
        const point = lngLatToWorld(request.latitude, request.longitude, zoom);
        const left = point.x - topLeft.x;
        const top = point.y - topLeft.y;
        const selected = request.id === selectedId;

        return (
          <button
            key={request.id}
            type="button"
            onClick={() => onSelect?.(request)}
            aria-label={`${request.reference}, ${request.address}, ${request.assessment.priority} priority`}
            className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[11px] font-bold shadow-md transition-transform hover:scale-110 focus-visible:scale-110 ${priorityClasses(
              request.assessment.priority
            )} ${selected ? "z-20 ring-4 ring-white" : "z-10"}`}
            style={{ left, top }}
            title={`${request.reference} - ${request.address}`}
          >
            {request.assessment.breakdown.danger}
          </button>
        );
      })}

      <div className="absolute right-3 top-3 flex overflow-hidden border border-slate-300 bg-white shadow-sm">
        <button
          type="button"
          onClick={() =>
            setZoomOffset((current) =>
              clamp(current + 1, MIN_ZOOM - fittedZoom, MAX_ZOOM - fittedZoom)
            )
          }
          className="flex h-8 w-8 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100"
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() =>
            setZoomOffset((current) =>
              clamp(current - 1, MIN_ZOOM - fittedZoom, MAX_ZOOM - fittedZoom)
            )
          }
          className="flex h-8 w-8 items-center justify-center border-l border-slate-200 text-slate-700 transition-colors hover:bg-slate-100"
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 text-[10px] font-semibold">
        {(["Critical", "High", "Medium", "Low"] as const).map((priority) => (
          <span
            key={priority}
            className={`border px-1.5 py-0.5 shadow-sm ${priorityClasses(priority)}`}
          >
            {priority}
          </span>
        ))}
      </div>

      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-1 right-1 bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:underline"
      >
        © OpenStreetMap contributors
      </a>
    </div>
  );
}
