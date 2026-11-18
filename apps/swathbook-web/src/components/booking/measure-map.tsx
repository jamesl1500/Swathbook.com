"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";
import {
  DEFAULT_ZOOM,
  formatSqft,
  fromImagePoint,
  MAP_SIZE,
  MAP_ZOOMS,
  MAX_POLYGON_POINTS,
  MAX_POLYGONS,
  polygonAreaSqft,
  toImagePoint,
  totalAreaSqft,
  type LatLng,
  type MapZoom,
  type Polygon,
} from "@/libs/measure/geo";
import { brandTextColor, cn } from "@/libs/utils";

/** How close (in screen pixels) a tap must land to grab a point or close a shape. */
const HIT_RADIUS_PX = 16;
/** A press that moves less than this is a tap, not a drag. */
const DRAG_THRESHOLD_PX = 4;

type Drag = { shape: number | "draft"; index: number; startX: number; startY: number; moved: boolean };

function toPolygon(points: LatLng[]): Polygon {
  return points.map(({ lat, lng }) => [lat, lng]);
}

function toPoints(polygon: Polygon): LatLng[] {
  return polygon.map(([lat, lng]) => ({ lat, lng }));
}

/**
 * Outline an area on a satellite photo of the customer's address. Tap the
 * corners, tap the first point to close the shape, and add more shapes for
 * separate areas (front and back yard). Points can be dragged to fine-tune.
 * Shapes are kept as lat/lng, so switching zoom keeps them in place.
 */
export function MeasureMap({
  center,
  links,
  value,
  onChange,
  brandColor,
}: {
  center: LatLng;
  /** Signed satellite photo links per zoom level (see libs/google/satellite.ts). */
  links: Record<MapZoom, string>;
  /** Finished shapes. */
  value: Polygon[];
  onChange: (polygons: Polygon[]) => void;
  brandColor: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState<MapZoom>(DEFAULT_ZOOM);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [scale, setScale] = useState(1);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);

  const shapes = value.map(toPoints);

  // Viewbox units per screen pixel, so handles stay finger-sized at any width.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setScale(MAP_SIZE / Math.max(1, entry.contentRect.width)));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const project = (point: LatLng) => toImagePoint(point, center, zoom);

  function eventPoint(event: React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * MAP_SIZE) / rect.width;
    const y = ((event.clientY - rect.top) * MAP_SIZE) / rect.height;
    return { x: Math.min(MAP_SIZE, Math.max(0, x)), y: Math.min(MAP_SIZE, Math.max(0, y)) };
  }

  /** The point under the pointer, if any: draft points first, then finished shapes. */
  function hit(x: number, y: number): { shape: number | "draft"; index: number } | null {
    const radius = HIT_RADIUS_PX * scale;
    const near = (point: LatLng) => {
      const p = project(point);
      return Math.hypot(p.x - x, p.y - y) <= radius;
    };
    const draftIndex = draft.findIndex(near);
    if (draftIndex >= 0) return { shape: "draft", index: draftIndex };
    for (let shape = shapes.length - 1; shape >= 0; shape--) {
      const index = shapes[shape].findIndex(near);
      if (index >= 0) return { shape, index };
    }
    return null;
  }

  function finishDraft(points = draft) {
    if (points.length < 3 || value.length >= MAX_POLYGONS) return;
    onChange([...value, toPolygon(points)]);
    setDraft([]);
  }

  function movePoint(target: Drag, point: LatLng) {
    if (target.shape === "draft") {
      setDraft((current) => current.map((existing, index) => (index === target.index ? point : existing)));
    } else {
      onChange(
        value.map((polygon, shape) =>
          shape === target.shape ? polygon.map((existing, index) => (index === target.index ? ([point.lat, point.lng] as [number, number]) : existing)) : polygon,
        ),
      );
    }
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const { x, y } = eventPoint(event);
    const target = hit(x, y);
    if (target) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ ...target, startX: event.clientX, startY: event.clientY, moved: false });
      return;
    }
    if (value.length >= MAX_POLYGONS || draft.length >= MAX_POLYGON_POINTS) return;
    setDraft((current) => [...current, fromImagePoint(x, y, center, zoom)]);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_THRESHOLD_PX;
    if (!moved) return;
    if (!drag.moved) setDrag({ ...drag, moved: true });
    const { x, y } = eventPoint(event);
    movePoint(drag, fromImagePoint(x, y, center, zoom));
  }

  function onPointerUp() {
    // A tap on the first point closes the shape being drawn.
    if (drag && !drag.moved && drag.shape === "draft" && drag.index === 0 && draft.length >= 3) finishDraft();
    setDrag(null);
  }

  const total = totalAreaSqft(value) + (draft.length >= 3 ? Math.round(polygonAreaSqft(toPolygon(draft))) : 0);
  const zoomIndex = MAP_ZOOMS.indexOf(zoom);
  const handle = 9 * scale;
  const stroke = 2.5 * scale;
  const pin = project(center);

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-[640px] overflow-hidden rounded-[1.25rem] border border-line bg-paper-deep">
        {/* Only the zoom in use is fetched: each photo is a billed Maps request. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- signed satellite photo from our own proxy */}
        <img
          key={zoom}
          src={links[zoom]}
          alt="Your address from above"
          draggable={false}
          onLoad={() => setLoaded((current) => ({ ...current, [zoom]: true }))}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full select-none object-cover"
        />
        {!loaded[zoom] && !failed ? <div className="absolute inset-0 animate-pulse bg-paper-deep" aria-hidden="true" /> : null}
        {failed ? (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-soft">
            The satellite photo didn&apos;t load. Enter the size instead below.
          </p>
        ) : null}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
          className="absolute inset-0 size-full cursor-crosshair touch-none"
          role="img"
          aria-label={value.length ? `${value.length} outlined ${value.length === 1 ? "area" : "areas"}, ${formatSqft(totalAreaSqft(value))}` : "Map for outlining the area"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          {/* The address itself */}
          <circle cx={pin.x} cy={pin.y} r={5 * scale} fill="#ffffff" stroke="#0b1220" strokeWidth={2 * scale} />

          {shapes.map((points, shape) => (
            <g key={shape}>
              <polygon
                points={points.map((point) => `${project(point).x},${project(point).y}`).join(" ")}
                fill={brandColor}
                fillOpacity={0.35}
                stroke="#ffffff"
                strokeWidth={stroke}
                strokeLinejoin="round"
              />
              {points.map((point, index) => (
                <circle key={index} cx={project(point).x} cy={project(point).y} r={handle * 0.75} fill="#ffffff" stroke={brandColor} strokeWidth={stroke} />
              ))}
            </g>
          ))}

          {draft.length ? (
            <g>
              <polyline
                points={draft.map((point) => `${project(point).x},${project(point).y}`).join(" ")}
                fill={draft.length >= 3 ? brandColor : "none"}
                fillOpacity={0.2}
                stroke="#ffffff"
                strokeWidth={stroke}
                strokeDasharray={`${6 * scale} ${4 * scale}`}
                strokeLinejoin="round"
              />
              {draft.map((point, index) => (
                <circle
                  key={index}
                  cx={project(point).x}
                  cy={project(point).y}
                  r={index === 0 && draft.length >= 3 ? handle * 1.25 : handle}
                  fill={index === 0 ? brandColor : "#ffffff"}
                  stroke={index === 0 ? "#ffffff" : brandColor}
                  strokeWidth={stroke}
                />
              ))}
            </g>
          ) : null}
        </svg>

        <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-xl border border-line bg-card/95 shadow-lift">
          <button
            type="button"
            onClick={() => setZoom(MAP_ZOOMS[Math.min(MAP_ZOOMS.length - 1, zoomIndex + 1)])}
            disabled={zoomIndex === MAP_ZOOMS.length - 1}
            aria-label="Zoom in"
            className="grid size-11 place-items-center hover:bg-paper-deep disabled:opacity-35"
          >
            <Plus className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(MAP_ZOOMS[Math.max(0, zoomIndex - 1)])}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
            className="grid size-11 place-items-center border-t border-line hover:bg-paper-deep disabled:opacity-35"
          >
            <Minus className="size-5" aria-hidden="true" />
          </button>
        </div>

        <p className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-[#0b1220]/80 px-3 py-1.5 text-sm font-semibold text-white" aria-live="polite">
          {total > 0 ? formatSqft(total) : "Tap the corners"}
        </p>
      </div>

      <p className="text-sm text-ink-soft">{instructions(draft.length, value.length)}</p>

      <div className="flex flex-wrap gap-2">
        {draft.length >= 3 ? (
          <ToolButton onClick={() => finishDraft()} primary brandColor={brandColor}>
            <Check className="size-4" aria-hidden="true" />
            Finish shape
          </ToolButton>
        ) : null}
        {draft.length ? (
          <ToolButton onClick={() => setDraft((current) => current.slice(0, -1))}>
            <Undo2 className="size-4" aria-hidden="true" />
            Undo point
          </ToolButton>
        ) : null}
        {value.length && !draft.length ? (
          <ToolButton onClick={() => onChange(value.slice(0, -1))}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Remove last shape
          </ToolButton>
        ) : null}
        {value.length || draft.length ? (
          <ToolButton
            onClick={() => {
              setDraft([]);
              onChange([]);
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Start over
          </ToolButton>
        ) : null}
      </div>
    </div>
  );
}

function instructions(draftPoints: number, shapes: number) {
  if (draftPoints >= 3) return "Tap the first point (or Finish shape) to close it.";
  if (draftPoints > 0) return "Keep tapping corners. You need at least three.";
  if (shapes > 0) return "Got it. Tap the map to outline another area, or continue.";
  return "Tap each corner of the area. Tap the first point again to close the shape. Drag any point to adjust it.";
}

function ToolButton({
  onClick,
  primary,
  brandColor,
  children,
}: {
  onClick: () => void;
  primary?: boolean;
  brandColor?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold",
        primary ? "" : "border border-line bg-card hover:border-ink-faint",
      )}
      style={primary && brandColor ? { backgroundColor: brandColor, color: brandTextColor(brandColor) } : undefined}
    >
      {children}
    </button>
  );
}
