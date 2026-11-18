/**
 * property.ts
 *
 * Reads the property notes the team keeps on an address (see the web app's
 * libs/property.ts, which owns the format): the pins and areas on the map,
 * as a list the crew can read on their phone.
 */

const PIN_LABELS: Record<string, string> = {
  gate: 'Gate',
  pet: 'Pet',
  hazard: 'Hazard',
  water: 'Spigot',
  parking: 'Parking',
  power: 'Outlet',
  note: 'Note',
};

const AREA_LABELS: Record<string, string> = { avoid: 'Keep off', careful: 'Careful' };

export type PropertyItem = { key: string; kind: string; label: string; isArea: boolean };

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Pins first, numbered as on the web map, then areas. Unknown shapes are skipped. */
export function propertyItems(map: unknown): PropertyItem[] {
  if (!map || typeof map !== 'object') return [];
  const { markers, areas } = map as { markers?: unknown; areas?: unknown };
  const pins = (Array.isArray(markers) ? markers : [])
    .filter((marker): marker is { kind: string; label?: unknown } => typeof marker?.kind === 'string')
    .map((marker, index) => {
      const kindLabel = PIN_LABELS[marker.kind] ?? 'Pin';
      const label = text(marker.label);
      return {
        key: `pin-${index}`,
        kind: kindLabel,
        label: `${index + 1}. ${label && label !== kindLabel ? `${label} (${kindLabel.toLowerCase()})` : kindLabel}`,
        isArea: false,
      };
    });
  const zones = (Array.isArray(areas) ? areas : [])
    .filter((area): area is { kind: string; label?: unknown } => typeof area?.kind === 'string')
    .map((area, index) => {
      const kindLabel = AREA_LABELS[area.kind] ?? 'Area';
      const label = text(area.label);
      return { key: `area-${index}`, kind: kindLabel, label: label && label !== kindLabel ? `${kindLabel}: ${label}` : kindLabel, isArea: true };
    });
  return [...pins, ...zones];
}
