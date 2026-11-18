import { describe, expect, it } from 'vitest';
import {
  angularDistance,
  clusterDegrees,
  clusterEvents,
  clusterOf,
  fanOut,
  markersUnder,
  RING_SLOTS,
  type Cluster,
} from './clusters';
import type { GlobeEvent, Severity } from './types';

function event(
  id: string,
  lat: number,
  lng: number,
  severity: Severity = 'low',
  published = '2026-11-07T10:00:00Z',
): GlobeEvent {
  return {
    id,
    title: `Event ${id}`,
    snippet: '',
    place: 'Somewhere',
    lat,
    lng,
    severity,
    categories: ['politics'],
    kind: 'news',
    published,
    sources: [{ name: 'Outlet', url: 'https://example.com/' + id }],
  };
}

describe('clusterDegrees', () => {
  it('groups less as the camera comes closer', () => {
    expect([3, 2, 1.6, 1.4, 1.2, 1, 0.9, 0.5].map(clusterDegrees)).toEqual([
      4, 4, 2, 2, 1, 1, 0, 0,
    ]);
  });
});

describe('angularDistance', () => {
  it('measures degrees on the globe', () => {
    expect(angularDistance(0, 0, 0, 10)).toBeCloseTo(10, 5);
    expect(angularDistance(0, 179, 0, -179)).toBeCloseTo(2, 5);
  });
});

describe('clusterEvents', () => {
  const hyderabad = event('hyd', 17.38, 78.48);
  const warangal = event('war', 17.97, 79.6, 'moderate');
  const vizag = event('viz', 17.69, 83.22);
  const tokyo = event('tok', 35.68, 139.69);

  it('groups nearby events behind the most severe one', () => {
    const clusters = clusterEvents([hyderabad, warangal, vizag, tokyo], 2);
    const india = clusters.find((c) => c.events.length === 2);
    expect(india?.lead.id).toBe('war');
    expect(india?.id).toBe('group:war');
    expect(india?.severity).toBe('moderate');
    expect([india?.lat, india?.lng]).toEqual([warangal.lat, warangal.lng]);
    expect(clusters).toHaveLength(3); // the India pair, Visakhapatnam, Tokyo
  });

  it('groups more from far away', () => {
    expect(clusterEvents([hyderabad, warangal, vizag, tokyo], 4)).toHaveLength(2);
  });

  it('does not group when zoomed right in', () => {
    const clusters = clusterEvents([hyderabad, warangal], 0);
    expect(clusters.map((c) => c.id)).toEqual(['war', 'hyd']);
  });

  it('groups across the date line', () => {
    expect(clusterEvents([event('a', -17, 179.5), event('b', -17, -179.5)], 2)).toHaveLength(1);
  });

  it('does not depend on input order', () => {
    const a = clusterEvents([hyderabad, warangal, vizag, tokyo], 2).map((c) => c.id);
    const b = clusterEvents([tokyo, vizag, warangal, hyderabad], 2).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('never groups a natural disaster with other news', () => {
    const quake = {
      ...event('quake', 17.4, 78.5, 'high'),
      categories: ['natural-disasters' as const],
      hazard: 'EQ',
    };
    const flood = {
      ...event('flood', 17.9, 79.6),
      categories: ['natural-disasters' as const],
      hazard: 'FL',
    };
    const clusters = clusterEvents([hyderabad, warangal, quake, flood], 4);
    expect(clusters).toHaveLength(2);
    const disasters = clusters.find((c) => c.lead.id === 'quake');
    expect(disasters?.events.map((e) => e.id).sort()).toEqual(['flood', 'quake']);
    const news = clusters.find((c) => c !== disasters);
    expect(news?.events.every((e) => !e.categories.includes('natural-disasters'))).toBe(true);
    // Still most severe first overall.
    expect(clusters[0].lead.id).toBe('quake');
  });

  it('finds the group an event belongs to', () => {
    const clusters = clusterEvents([hyderabad, warangal, tokyo], 2);
    expect(clusterOf(clusters, 'hyd')?.id).toBe('group:war');
    expect(clusterOf(clusters, 'tok')?.id).toBe('tok');
  });
});

describe('fanOut', () => {
  const marker = (id: string, lat: number, lng: number, disaster = false, hour = 0): Cluster => {
    const event = {
      id,
      categories: [disaster ? 'natural-disasters' : 'politics'],
      severity: 'low',
      published: new Date(Date.UTC(2026, 10, 8, 12 + hour)).toISOString(),
    };
    return { id, lead: event, events: [event], lat, lng, severity: 'low' } as unknown as Cluster;
  };
  const apart = (out: Cluster[], minimum: number): void => {
    for (const [i, a] of out.entries()) {
      for (const b of out.slice(i + 1)) {
        expect(angularDistance(a.lat, a.lng, b.lat, b.lng)).toBeGreaterThanOrEqual(minimum);
      }
    }
  };

  it('moves markers at the same place apart, each remembering its true place', () => {
    const out = fanOut([marker('a', 40, 10), marker('b', 40, 10), marker('c', 40, 10)], 1);
    expect(out).toHaveLength(3);
    expect(out.every((c) => !c.anchor || (c.anchor.lat === 40 && c.anchor.lng === 10))).toBe(true);
    apart(out, 0.89);
  });

  it('leaves markers with room where they are', () => {
    const out = fanOut([marker('a', 40, 10), marker('b', 45, 10)], 1);
    expect(out.map((c) => [c.lat, c.lng, c.anchor]).sort()).toEqual([
      [40, 10, undefined],
      [45, 10, undefined],
    ]);
  });

  it('gives the newest the true place and rings the others around it', () => {
    const out = fanOut([marker('old', 0, 0, false, 0), marker('new', 0, 0, false, 5)], 1);
    const newest = out.find((c) => c.id === 'new')!;
    expect([newest.lat, newest.lng, newest.anchor]).toEqual([0, 0, undefined]);
    expect(out.find((c) => c.id === 'old')!.anchor).toEqual({ lat: 0, lng: 0 });
  });

  it('keeps the newest stories apart and groups the oldest when room runs out', () => {
    // Nine at one place: the place and its ring hold seven; n0 is the oldest.
    const out = fanOut(
      Array.from({ length: 9 }, (_, i) => marker(`n${i}`, 0, 0, false, i)),
      1,
    );
    expect(out).toHaveLength(1 + RING_SLOTS);
    const singles = out.filter((c) => !c.id.startsWith('group:')).map((c) => c.id);
    expect(singles.sort()).toEqual(['n3', 'n4', 'n5', 'n6', 'n7', 'n8']);
    const group = out.find((c) => c.id.startsWith('group:'))!;
    expect(group.events.map((e) => e.id).sort()).toEqual(['n0', 'n1', 'n2']);
    apart(out, 0.89);
  });

  it('never leaves a marker on top of a neighbour', () => {
    // Three at one place and one just beside it: its ring slots must avoid the neighbour.
    const out = fanOut(
      [marker('a', 0, 0), marker('b', 0, 0), marker('c', 0, 0), marker('d', 0, 1.05)],
      1,
    );
    expect(out).toHaveLength(4);
    apart(out, 0.89);
  });

  it('keeps disaster symbols and pillars in separate groups', () => {
    const pile = [
      ...Array.from({ length: 9 }, (_, i) => marker(`n${i}`, 0, 0, false, i)),
      marker('d0', 0, 0, true, -2),
      marker('d1', 0, 0, true, -1),
    ];
    const out = fanOut(pile, 1);
    for (const group of out.filter((c) => c.id.startsWith('group:'))) {
      const kinds = new Set(group.events.map((e) => e.categories[0]));
      expect(kinds.size).toBe(1);
    }
    expect(out.flatMap((c) => c.events)).toHaveLength(pile.length);
  });

  it('does nothing with a spacing of 0', () => {
    const clusters = [marker('a', 40, 10), marker('b', 40, 10)];
    expect(fanOut(clusters, 0)).toBe(clusters);
  });
});

describe('markersUnder', () => {
  const at = (id: string, x: number, published: string) =>
    ({
      id,
      lead: { id, severity: 'low', published },
      events: [{ id, severity: 'low', published }],
      lat: 10,
      lng: x / 100,
      severity: 'low',
      screen: { x, y: 100 },
    }) as unknown as Cluster & { screen: { x: number; y: number } };
  const screenOf = (c: Cluster) => (c as Cluster & { screen: { x: number; y: number } }).screen;

  it('lists every event of markers touching the clicked one, newest first on ties', () => {
    const a = at('a', 100, '2026-11-08T10:00:00Z');
    const b = at('b', 115, '2026-11-08T12:00:00Z');
    const far = at('far', 300, '2026-11-08T11:00:00Z');
    const out = markersUnder(a, [a, b, far], screenOf, 28);
    expect(out.id).toBe('here:b');
    expect(out.events.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('opens a lone marker as itself', () => {
    const a = at('a', 100, '2026-11-08T10:00:00Z');
    const far = at('far', 300, '2026-11-08T11:00:00Z');
    expect(markersUnder(a, [a, far], screenOf, 28)).toBe(a);
  });
});
