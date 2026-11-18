"use client";

import { useRef, useState } from "react";
import { Ban, Car, Check, DoorOpen, Droplet, Minus, PawPrint, Plug, Plus, StickyNote, TriangleAlert, Undo2 } from "lucide-react";
import { DEFAULT_ZOOM, fromImagePoint, MAP_SIZE, MAP_ZOOMS, toImagePoint, type LatLng, type MapZoom } from "@/libs/measure/geo";
import {
  AREA_LABELS,
  MARKER_LABELS,
  MAX_AREA_POINTS,
  MAX_AREAS,
  MAX_MARKERS,
  type AreaKind,
  type MarkerKind,
  type PropertyMap as PropertyMapValue,
} from "@/libs/property";
import { cn } from "@/libs/utils";

export const MARKER_ICONS: Record<MarkerKind, typeof DoorOpen> = {
  gate: DoorOpen,
  pet: PawPrint,
  hazard: TriangleAlert,
  water: Droplet,
  parking: Car,
  power: Plug,
  note: StickyNote,
};

const MARKER_COLORS: Record<MarkerKind, string> = {
  gate: "#1c3d70",
  pet: "#7a4fb0",
  hazard: "#c2410c",
  water: "#0e7c86",
  parking: "#334155",
  power: "#b7791f",
  note: "#2f855a",
};

export const AREA_COLORS: Record<AreaKind, string> = { avoid: "#dc2626", careful: "#f59e0b" };

/** What a tap on the map does while editing. */
export type Tool = { type: "pin"; kind: MarkerKind } | { type: "area"; kind: AreaKind } | null;

/**
 * A satellite photo of the property with the crew's pins and areas on it.
 * Read-only unless `onChange` is given; then taps add a pin or an area's
 * corner (per `tool`) and pins can be dragged.
 */
export function PropertyMap({
  center,
  links,
  value,
  onChange,
  tool = null,
  onToolDone,
  selected,
  onSelect,
}: {
  center: LatLng;
  links: Record<MapZoom, string>;
  value: PropertyMapValue;
  onChange?: (value: PropertyMapValue) => void;
  tool?: Tool;
  /** Called when an area is finished, so the editor can drop the tool. */
  onToolDone?: () => void;
  /** Index of the highlighted pin, matching the legend. */
  selected?: number | null;
  onSelect?: (index: number | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<MapZoom>(DEFAULT_ZOOM);
  // A half-drawn area belongs to the tool that started it; switching tools drops it.
  const toolKey = tool?.type === "area" ? tool.kind : null;
  const [drawing, setDrawing] = useState<{ key: string | null; points: LatLng[] }>({ key: null, points: [] });
  const draft = drawing.key === toolKey && toolKey ? drawing.points : [];
  const setDraft = (update: LatLng[] | ((current: LatLng[]) => LatLng[])) =>
    setDrawing({ key: toolKey, points: typeof update === "function" ? update(draft) : update });
  const [dragging, setDragging] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const editing = Boolean(onChange);

  const project = (point: LatLng) => toImagePoint(point, center, zoom);
  const percent = (point: LatLng) => {
    const p = project(point);
    return { left: `${(p.x / MAP_SIZE) * 100}%`, top: `${(p.y / MAP_SIZE) * 100}%`, inside: p.x >= 0 && p.y >= 0 && p.x <= MAP_SIZE && p.y <= MAP_SIZE };
  };

  function pointAt(clientX: number, clientY: number) {
    const rect = box.current!.getBoundingClientRect();
    const x = Math.min(MAP_SIZE, Math.max(0, ((clientX - rect.left) * MAP_SIZE) / rect.width));
    const y = Math.min(MAP_SIZE, Math.max(0, ((clientY - rect.top) * MAP_SIZE) / rect.height));
    return fromImagePoint(x, y, center, zoom);
  }

  function finishArea(points = draft) {
    if (!onChange || tool?.type !== "area" || points.length < 3 || value.areas.length >= MAX_AREAS) return;
    onChange({ ...value, areas: [...value.areas, { kind: tool.kind, label: AREA_LABELS[tool.kind], points: points.map(({ lat, lng }) => [lat, lng]) }] });
    setDraft([]);
    onToolDone?.();
  }

  function onMapPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!onChange || !tool || event.button !== 0) return;
    const point = pointAt(event.clientX, event.clientY);
    if (tool.type === "pin") {
      if (value.markers.length >= MAX_MARKERS) return;
      onChange({ ...value, markers: [...value.markers, { kind: tool.kind, label: MARKER_LABELS[tool.kind], ...point }] });
      onSelect?.(value.markers.length);
      return;
    }
    // Tapping near the first corner closes the area.
    if (draft.length >= 3) {
      const first = project(draft[0]);
      const rect = box.current!.getBoundingClientRect();
      const tapped = toImagePoint(point, center, zoom);
      if (Math.hypot(first.x - tapped.x, first.y - tapped.y) * (rect.width / MAP_SIZE) <= 16) {
        finishArea();
        return;
      }
    }
    if (draft.length < MAX_AREA_POINTS) setDraft((current) => [...current, point]);
  }

  const zoomIndex = MAP_ZOOMS.indexOf(zoom);

  return (
    <div className="space-y-2">
      <div
        ref={box}
        className={cn(
          "relative mx-auto aspect-square w-full max-w-[640px] touch-none select-none overflow-hidden rounded-[1.25rem] border border-line bg-paper-deep",
          editing && tool && "cursor-crosshair",
        )}
        onPointerDown={onMapPointer}
        onPointerMove={(event) => {
          if (dragging == null || !onChange) return;
          const point = pointAt(event.clientX, event.clientY);
          onChange({ ...value, markers: value.markers.map((marker, index) => (index === dragging ? { ...marker, ...point } : marker)) });
        }}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed satellite photo from our own proxy */}
        <img
          key={zoom}
          src={links[zoom]}
          alt="The property from above"
          draggable={false}
          onError={() => setFailed(true)}
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
        {failed ? <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-soft">The satellite photo didn&apos;t load.</p> : null}

        <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {value.areas.map((area, index) => (
            <polygon
              key={index}
              points={area.points.map(([lat, lng]) => `${project({ lat, lng }).x},${project({ lat, lng }).y}`).join(" ")}
              fill={AREA_COLORS[area.kind]}
              fillOpacity={0.3}
              stroke={AREA_COLORS[area.kind]}
              strokeWidth={3}
              strokeDasharray={area.kind === "avoid" ? "10 6" : undefined}
            />
          ))}
          {draft.length ? (
            <>
              <polyline
                points={draft.map((point) => `${project(point).x},${project(point).y}`).join(" ")}
                fill="none"
                stroke="#ffffff"
                strokeWidth={3}
                strokeDasharray="8 5"
              />
              {draft.map((point, index) => (
                <circle key={index} cx={project(point).x} cy={project(point).y} r={index === 0 ? 10 : 7} fill={index === 0 ? "#ffffff" : "#0b1220"} stroke="#ffffff" strokeWidth={2} />
              ))}
            </>
          ) : null}
        </svg>

        {value.markers.map((marker, index) => {
          const Icon = MARKER_ICONS[marker.kind];
          const position = percent(marker);
          if (!position.inside) return null;
          return (
            <button
              key={index}
              type="button"
              aria-label={`${index + 1}. ${marker.label || MARKER_LABELS[marker.kind]}`}
              title={marker.label || MARKER_LABELS[marker.kind]}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect?.(index);
                if (editing) {
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  setDragging(index);
                }
              }}
              className={cn(
                "absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-white shadow-lift",
                selected === index && "ring-4 ring-white/70",
                editing && "cursor-grab",
              )}
              style={{ left: position.left, top: position.top, backgroundColor: MARKER_COLORS[marker.kind] }}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-white text-[0.65rem] font-bold text-ink">{index + 1}</span>
            </button>
          );
        })}

        <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-xl border border-line bg-card/95 shadow-lift" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={() => setZoom(MAP_ZOOMS[Math.min(MAP_ZOOMS.length - 1, zoomIndex + 1)])}
            disabled={zoomIndex === MAP_ZOOMS.length - 1}
            aria-label="Zoom in"
            className="grid size-10 place-items-center hover:bg-paper-deep disabled:opacity-35"
          >
            <Plus className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(MAP_ZOOMS[Math.max(0, zoomIndex - 1)])}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
            className="grid size-10 place-items-center border-t border-line hover:bg-paper-deep disabled:opacity-35"
          >
            <Minus className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {editing && tool?.type === "area" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-soft">
            {draft.length < 3 ? "Tap the corners of the area." : "Tap the first corner, or Finish, to close it."}
          </span>
          {draft.length >= 3 ? (
            <button type="button" onClick={() => finishArea()} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 font-semibold text-paper">
              <Check className="size-4" aria-hidden="true" />
              Finish area
            </button>
          ) : null}
          {draft.length ? (
            <button type="button" onClick={() => setDraft((current) => current.slice(0, -1))} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-4 font-semibold">
              <Undo2 className="size-4" aria-hidden="true" />
              Undo corner
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The key to the map: each pin by number, then each area. */
export function PropertyLegend({
  value,
  selected,
  onSelect,
}: {
  value: PropertyMapValue;
  selected?: number | null;
  onSelect?: (index: number) => void;
}) {
  if (!value.markers.length && !value.areas.length) return null;
  return (
    <ul className="grid gap-1.5 text-sm sm:grid-cols-2" aria-label="On the map">
      {value.markers.map((marker, index) => {
        const Icon = MARKER_ICONS[marker.kind];
        return (
          <li key={`m${index}`}>
            <button
              type="button"
              onClick={() => onSelect?.(index)}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-paper", selected === index && "bg-paper")}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: MARKER_COLORS[marker.kind] }}>
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <span className="font-semibold">{index + 1}.</span>
              <span className="min-w-0 truncate">{marker.label || MARKER_LABELS[marker.kind]}</span>
            </button>
          </li>
        );
      })}
      {value.areas.map((area, index) => (
        <li key={`a${index}`} className="flex items-center gap-2 px-2 py-1.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ backgroundColor: `${AREA_COLORS[area.kind]}40`, border: `2px solid ${AREA_COLORS[area.kind]}` }}>
            {area.kind === "avoid" ? <Ban className="size-3.5" style={{ color: AREA_COLORS.avoid }} aria-hidden="true" /> : null}
          </span>
          <span className="min-w-0 truncate">{area.label || AREA_LABELS[area.kind]}</span>
        </li>
      ))}
    </ul>
  );
}
