import { describe, expect, it } from 'vitest';

import { propertyItems } from './property';

describe('propertyItems', () => {
  it('lists pins by number, then areas', () => {
    expect(
      propertyItems({
        markers: [
          { kind: 'gate', label: 'Side gate', lat: 1, lng: 2 },
          { kind: 'pet', label: 'Pet', lat: 1, lng: 2 },
        ],
        areas: [{ kind: 'avoid', label: 'Flower bed', points: [] }],
      }).map((item) => item.label),
    ).toEqual(['1. Side gate (gate)', '2. Pet', 'Keep off: Flower bed']);
  });

  it('copes with nothing, or with junk', () => {
    expect(propertyItems(null)).toEqual([]);
    expect(propertyItems({ markers: 'x', areas: [null, { kind: 3 }] })).toEqual([]);
  });
});
