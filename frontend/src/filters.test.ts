import { describe, expect, it } from 'vitest';
import {
  currentIn,
  defaultFilters,
  fromQuery,
  isDefault,
  matches,
  recentFrom,
  toQuery,
  windowOf,
  withPageState,
  viewFromQuery,
} from './filters';
import { CATEGORIES, type GlobeEvent } from './types';

const NOW = Date.parse('2026-11-08T12:00:00Z');

describe('withPageState', () => {
  it.each([
    ['', 'news', false, ''],
    ['?cat=war', 'news', false, '?cat=war'],
    ['', 'geo', false, '?view=geo'],
    ['', 'atlas', false, '?view=atlas'],
    ['', 'news', true, '?list=1'],
    ['?cat=war', 'geo', true, '?cat=war&view=geo&list=1'],
  ] as const)('%j view=%s list=%s gives %j', (query, view, list, expected) => {
    expect(withPageState(query, { view, list })).toBe(expected);
  });

  it.each([
    ['', 'news'],
    ['?view=geo', 'geo'],
    ['?view=atlas', 'atlas'],
    ['?view=nonsense', 'news'],
  ])('%j opens the %s map', (search, view) => {
    expect(viewFromQuery(search)).toBe(view);
  });

  it('leaves the filters readable', () => {
    const state = fromQuery(withPageState('?range=24h', { view: 'geo', list: true }));
    expect(state.range).toBe('24h');
  });
});

function event(overrides: Partial<GlobeEvent> = {}): GlobeEvent {
  return {
    id: 'e',
    title: 'Example',
    snippet: '',
    place: 'Hyderabad, India',
    lat: 17.4,
    lng: 78.5,
    severity: 'moderate',
    categories: ['politics', 'economic'],
    kind: 'news',
    published: '2026-11-08T09:00:00Z',
    sources: [{ name: 'Outlet', url: 'https://example.com/a' }],
    geo: {
      continent: 'Asia',
      region: 'Southern Asia',
      country: 'India',
      country_code: 'IN',
      admin1: 'Telangana',
      city: 'Hyderabad',
      precision: 'city',
    },
    ...overrides,
  };
}

describe('matches', () => {
  it('shows everything recent by default', () => {
    expect(matches(event(), defaultFilters(), NOW)).toBe(true);
  });

  it("filters by category (any of the event's categories)", () => {
    const state = defaultFilters();
    state.categories = new Set(['economic']);
    expect(matches(event(), state, NOW)).toBe(true);
    state.categories = new Set(['war']);
    expect(matches(event(), state, NOW)).toBe(false);
  });

  it('filters by severity', () => {
    const state = defaultFilters();
    state.severities = new Set(['high', 'critical']);
    expect(matches(event(), state, NOW)).toBe(false);
  });

  it('filters by place, level by level', () => {
    const state = defaultFilters();
    state.place = ['Asia', 'Southern Asia', 'IN'];
    expect(matches(event(), state, NOW)).toBe(true);
    state.place = ['Asia', 'Southern Asia', 'PK'];
    expect(matches(event(), state, NOW)).toBe(false);
    state.place = ['Asia'];
    expect(matches(event({ geo: undefined }), state, NOW)).toBe(false);
  });

  it('filters by time window, also back in time', () => {
    const state = defaultFilters();
    state.range = '6h';
    expect(matches(event(), state, NOW)).toBe(true);
    expect(matches(event({ published: '2026-11-08T05:00:00Z' }), state, NOW)).toBe(false);
    state.end = Date.parse('2026-11-08T06:00:00Z');
    expect(matches(event({ published: '2026-11-08T05:00:00Z' }), state, NOW)).toBe(true);
    expect(matches(event(), state, NOW)).toBe(false);
  });
});

describe('windowOf', () => {
  it('never ends in the future', () => {
    const state = defaultFilters();
    state.end = NOW + 3_600_000;
    expect(windowOf(state, NOW).to).toBe(NOW);
  });
});

describe('recentFrom (older news as small dots)', () => {
  it('has no cut for windows of 3 days or less', () => {
    for (const range of ['6h', '24h', '3d'] as const) {
      expect(recentFrom({ ...defaultFilters(), range }, NOW)).toBeNull();
    }
  });

  it('cuts 3 days before the end of a longer window, also one moved back in time', () => {
    expect(recentFrom({ ...defaultFilters(), range: '14d' }, NOW)).toBe(NOW - 72 * 3_600_000);
    const end = NOW - 48 * 3_600_000;
    expect(recentFrom({ ...defaultFilters(), range: '7d', end }, NOW)).toBe(end - 72 * 3_600_000);
  });
});

describe('the web address', () => {
  it('is empty for the default view', () => {
    expect(toQuery(defaultFilters())).toBe('');
    expect(isDefault(fromQuery(''))).toBe(true);
  });

  it('round-trips every filter', () => {
    const state = defaultFilters();
    state.categories = new Set(['war', 'health']);
    state.severities = new Set(['critical']);
    state.range = '24h';
    state.end = Date.parse('2026-11-07T15:00:00Z');
    state.place = ['Asia', 'Southern Asia', 'IN'];
    const query = toQuery(state);
    expect(query).toContain('cat=war%2Chealth');
    const again = fromQuery(query);
    expect([...again.categories]).toEqual(['war', 'health']);
    expect([...again.severities]).toEqual(['critical']);
    expect(again.range).toBe('24h');
    expect(again.end).toBe(state.end);
    expect(again.place).toEqual(['Asia', 'Southern Asia', 'IN']);
  });

  it('starts with every category on, Sport included', () => {
    const state = defaultFilters();
    expect(state.categories.size).toBe(CATEGORIES.length);
    expect(state.categories.has('sport')).toBe(true);
    expect(isDefault(state)).toBe(true);
    // Links without "cat", and broken ones, get the default.
    expect(fromQuery('?range=24h').categories.has('sport')).toBe(true);
    expect(fromQuery('?cat=gossip').categories.has('sport')).toBe(true);
  });

  it('keeps Sport off when a visitor turned it off', () => {
    const state = defaultFilters();
    state.categories.delete('sport');
    expect(isDefault(state)).toBe(false);
    const query = toQuery(state);
    expect(query).toContain('cat=');
    expect(fromQuery(query).categories.has('sport')).toBe(false);
  });

  it('ignores unknown values', () => {
    const state = fromQuery('?cat=war,gossip&sev=extreme&range=1y&end=never');
    expect([...state.categories]).toEqual(['war']);
    expect(state.severities.size).toBe(4); // nothing valid: show all, not an empty globe
    expect(fromQuery('?sev=none').severities.size).toBe(0);
    expect(state.range).toBe('3d');
    expect(state.end).toBeNull();
  });
});

describe('reports that stay current (until)', () => {
  const HOUR = 3_600_000;
  const report = event({
    published: new Date(NOW - 10 * 24 * HOUR).toISOString(),
    until: new Date(NOW + 4 * 24 * HOUR).toISOString(),
  });

  it('counts a report in every window while it is current', () => {
    expect(currentIn(report, NOW - 6 * HOUR, NOW)).toBe(true);
    expect(matches(report, defaultFilters(), NOW)).toBe(true);
  });

  it('never counts it in a window that ends before it was published', () => {
    expect(currentIn(report, NOW - 14 * 24 * HOUR, NOW - 11 * 24 * HOUR)).toBe(false);
  });

  it('counts an event without until only at its publication time', () => {
    const plain = event({ published: new Date(NOW - 10 * 24 * HOUR).toISOString() });
    expect(currentIn(plain, NOW - 72 * HOUR, NOW)).toBe(false);
    expect(matches(plain, { ...defaultFilters(), range: '14d' }, NOW)).toBe(true);
  });

  it('offers a 14-day window', () => {
    expect(windowOf({ ...defaultFilters(), range: '14d' }, NOW).from).toBe(NOW - 336 * HOUR);
  });
});
