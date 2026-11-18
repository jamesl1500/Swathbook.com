"use client";

import { useState, useTransition } from "react";
import { KeyRound, LoaderCircle, PawPrint, Pencil, StickyNote, Trash } from "lucide-react";
import { toast } from "sonner";
import { savePropertyNotes } from "@/app/dashboard/customers/property-actions";
import { CopyButton } from "@/components/app/copy-button";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import type { LatLng, MapZoom } from "@/libs/measure/geo";
import { AREA_KINDS, AREA_LABELS, MARKER_KINDS, MARKER_LABELS, MAX_MARKERS, type PropertyMap as PropertyMapValue } from "@/libs/property";
import { cn } from "@/libs/utils";
import { AREA_COLORS, MARKER_ICONS, PropertyLegend, PropertyMap, type Tool } from "./property-map";

export type PropertyNotesValue = {
  addressId: string;
  gateCode: string;
  pets: string;
  accessNotes: string;
  map: PropertyMapValue;
};

/**
 * What the crew should know about a property: gate code, pets, notes and a
 * map of pins and areas. Shows them read-only, with an Edit button for the
 * whole team.
 */
export function PropertyNotes({
  businessId,
  value,
  center,
  links,
  canEdit,
  compact = false,
}: {
  businessId: string;
  value: PropertyNotesValue;
  /** The address on the map, when it has coordinates. */
  center: LatLng | null;
  /** Signed satellite photos of it, when Maps is set up. */
  links: Record<MapZoom, string> | null;
  canEdit: boolean;
  /** On a job page: lead with what the crew needs at the gate. */
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const empty = !value.gateCode && !value.pets && !value.accessNotes && !value.map.markers.length && !value.map.areas.length;

  if (editing) return <PropertyEditor businessId={businessId} value={value} center={center} links={links} onDone={() => setEditing(false)} />;

  return (
    <div className="space-y-4" data-testid="property-notes">
      {empty ? (
        <p className="text-sm text-ink-soft">No property notes yet. Add the gate code, pets, and where things are for the crew.</p>
      ) : (
        <dl className={cn("grid gap-3 text-sm", !compact && "sm:grid-cols-2")}>
          {value.gateCode ? (
            <div className="rounded-xl bg-sun-soft px-4 py-3">
              <dt className="flex items-center gap-1.5 font-semibold">
                <KeyRound className="size-4" aria-hidden="true" />
                Gate code
              </dt>
              <dd className="mt-1 flex items-center gap-3">
                <span className="font-display text-2xl font-bold tracking-wider" data-testid="gate-code">
                  {value.gateCode}
                </span>
                <CopyButton value={value.gateCode} label="Copy" />
              </dd>
            </div>
          ) : null}
          {value.pets ? (
            <div className="rounded-xl bg-paper px-4 py-3">
              <dt className="flex items-center gap-1.5 font-semibold">
                <PawPrint className="size-4" aria-hidden="true" />
                Pets
              </dt>
              <dd className="mt-1">{value.pets}</dd>
            </div>
          ) : null}
          {value.accessNotes ? (
            <div className={cn("rounded-xl bg-paper px-4 py-3", !compact && "sm:col-span-2")}>
              <dt className="flex items-center gap-1.5 font-semibold">
                <StickyNote className="size-4" aria-hidden="true" />
                Notes
              </dt>
              <dd className="mt-1 whitespace-pre-line">{value.accessNotes}</dd>
            </div>
          ) : null}
        </dl>
      )}

      {center && links && (value.map.markers.length || value.map.areas.length) ? (
        <div className="space-y-3">
          <PropertyMap center={center} links={links} value={value.map} selected={selected} onSelect={setSelected} />
          <PropertyLegend value={value.map} selected={selected} onSelect={setSelected} />
        </div>
      ) : null}

      {canEdit ? (
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden="true" />
          {empty ? "Add property notes" : "Edit property notes"}
        </Button>
      ) : null}
    </div>
  );
}

function PropertyEditor({
  businessId,
  value,
  center,
  links,
  onDone,
}: {
  businessId: string;
  value: PropertyNotesValue;
  center: LatLng | null;
  links: Record<MapZoom, string> | null;
  onDone: () => void;
}) {
  const [gateCode, setGateCode] = useState(value.gateCode);
  const [pets, setPets] = useState(value.pets);
  const [accessNotes, setAccessNotes] = useState(value.accessNotes);
  const [map, setMap] = useState(value.map);
  const [tool, setTool] = useState<Tool>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string[]>>>({});
  const [pending, startTransition] = useTransition();
  const id = (name: string) => `${value.addressId}-${name}`;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await savePropertyNotes({ businessId, addressId: value.addressId, gateCode, pets, accessNotes, map });
      if (result.error) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(result.success ?? "Saved.");
      onDone();
    });
  }

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold",
      active ? "border-ink bg-ink text-paper" : "border-line bg-card hover:border-ink-faint",
    );

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {error ? <FormMessage>{error}</FormMessage> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gate code" htmlFor={id("gate")} error={fieldErrors.gateCode?.[0]}>
          <Input id={id("gate")} value={gateCode} maxLength={40} onChange={(event) => setGateCode(event.target.value)} autoComplete="off" />
        </Field>
        <Field label="Pets" htmlFor={id("pets")} error={fieldErrors.pets?.[0]}>
          <Input id={id("pets")} value={pets} maxLength={200} onChange={(event) => setPets(event.target.value)} placeholder="Friendly lab, keep the side gate shut" />
        </Field>
      </div>
      <Field label="Notes for the crew" htmlFor={id("notes")} hint="Where to park, what to watch out for." error={fieldErrors.accessNotes?.[0]}>
        <textarea
          id={id("notes")}
          rows={3}
          maxLength={500}
          value={accessNotes}
          onChange={(event) => setAccessNotes(event.target.value)}
          className="block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[0.95rem] focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-200"
        />
      </Field>

      {center && links ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">On the map</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Add a pin">
            {MARKER_KINDS.map((kind) => {
              const Icon = MARKER_ICONS[kind];
              const active = tool?.type === "pin" && tool.kind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={active}
                  disabled={!active && map.markers.length >= MAX_MARKERS}
                  onClick={() => setTool(active ? null : { type: "pin", kind })}
                  className={chip(active)}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {MARKER_LABELS[kind]}
                </button>
              );
            })}
            {AREA_KINDS.map((kind) => {
              const active = tool?.type === "area" && tool.kind === kind;
              return (
                <button key={kind} type="button" aria-pressed={active} onClick={() => setTool(active ? null : { type: "area", kind })} className={chip(active)}>
                  <span className="size-3 rounded-sm" style={{ backgroundColor: AREA_COLORS[kind] }} aria-hidden="true" />
                  {AREA_LABELS[kind]} area
                </button>
              );
            })}
          </div>
          <p className="text-sm text-ink-soft">
            {tool?.type === "pin"
              ? `Tap the map to drop a ${MARKER_LABELS[tool.kind].toLowerCase()} pin. Drag pins to move them.`
              : tool?.type === "area"
                ? "Tap the corners of the area."
                : "Pick a pin or an area above, then tap the map."}
          </p>
          <PropertyMap
            center={center}
            links={links}
            value={map}
            onChange={setMap}
            tool={tool}
            onToolDone={() => setTool(null)}
            selected={selected}
            onSelect={setSelected}
          />

          {map.markers.length || map.areas.length ? (
            <ul className="space-y-2" aria-label="Pins and areas">
              {map.markers.map((marker, index) => (
                <li key={`m${index}`} className={cn("flex items-center gap-2", selected === index && "rounded-xl bg-paper p-1")}>
                  <span className="w-6 shrink-0 text-right text-sm font-semibold">{index + 1}.</span>
                  <Input
                    aria-label={`Label for pin ${index + 1}`}
                    value={marker.label}
                    maxLength={60}
                    onFocus={() => setSelected(index)}
                    onChange={(event) => setMap({ ...map, markers: map.markers.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)) })}
                  />
                  <RemoveButton label={`Remove pin ${index + 1}`} onClick={() => setMap({ ...map, markers: map.markers.filter((_, i) => i !== index) })} />
                </li>
              ))}
              {map.areas.map((area, index) => (
                <li key={`a${index}`} className="flex items-center gap-2">
                  <span className="grid w-6 shrink-0 place-items-end">
                    <span className="size-3 rounded-sm" style={{ backgroundColor: AREA_COLORS[area.kind] }} aria-hidden="true" />
                  </span>
                  <Input
                    aria-label={`Label for area ${index + 1}`}
                    value={area.label}
                    maxLength={60}
                    onChange={(event) => setMap({ ...map, areas: map.areas.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)) })}
                  />
                  <RemoveButton label={`Remove area ${index + 1}`} onClick={() => setMap({ ...map, areas: map.areas.filter((_, i) => i !== index) })} />
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>
      ) : (
        <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">The map shows up once this address has a location (pick it from the suggestions when editing the address).</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          Save property notes
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-clay-soft hover:text-clay">
      <Trash className="size-4" aria-hidden="true" />
    </button>
  );
}
