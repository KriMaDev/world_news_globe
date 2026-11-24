/**
 * What the visitor chose to see: categories, severities, a time window and a place. Kept in
 * the web address (so a view can be shared) and applied to every part of the page.
 */

import { CATEGORIES, SEVERITIES, type Category, type GlobeEvent, type Severity } from './types';
import type { MapView } from './geography';

/** Time windows, in hours. The data covers 14 days. */
export const RANGES = { '6h': 6, '24h': 24, '3d': 72, '7d': 168, '14d': 336 } as const;
export type RangeKey = keyof typeof RANGES;
export const RANGE_LABELS: Record<RangeKey, string> = {
  '6h': '6 h',
  '24h': '24 h',
  '3d': '3 days',
  '7d': '7 days',
  '14d': '14 days',
};
export const DEFAULT_RANGE: RangeKey = '3d';
export const HISTORY_HOURS = 336;

/** The place levels, from widest to narrowest; a path holds a value for the first few. */
export const PLACE_LEVELS = ['continent', 'region', 'country_code', 'admin1', 'city'] as const;
export type PlaceLevel = (typeof PLACE_LEVELS)[number];

export interface FilterState {
  categories: Set<Category>;
  severities: Set<Severity>;
  range: RangeKey;
  /** End of the time window (ms since 1970), or null for "now". */
  end: number | null;
  /** e.g. ["Asia", "Southern Asia", "IN"]; empty for the whole world. */
  place: string[];
  /** "Ongoing events": also count reports that are still current (`until`) in a window they
   * overlap. Off by default: only the publication time counts (owner, 24 Nov 2026). */
  ongoing: boolean;
}

export function defaultFilters(): FilterState {
  return {
    categories: new Set(CATEGORIES),
    severities: new Set(SEVERITIES),
    range: DEFAULT_RANGE,
    end: null,
    place: [],
    ongoing: false,
  };
}

const HOUR = 3_600_000;

/** The time window [from, to] in ms for a state; `now` is the current time. */
export function windowOf(state: FilterState, now: number): { from: number; to: number } {
  const to = state.end === null ? now : Math.min(state.end, now);
  return { from: to - RANGES[state.range] * HOUR, to };
}

/** News older than this, before the window's end, is drawn as a small dot when the window is
 * longer (owner, 19 Nov 2026: what is new stands tall; the default window shows no dots). */
export const RECENT_MARKER_HOURS = 72;

/** The moment news markers turn into small dots (ms since 1970), or null for none. */
export function recentFrom(state: FilterState, now: number): number | null {
  if (RANGES[state.range] <= RECENT_MARKER_HOURS) return null;
  return windowOf(state, now).to - RECENT_MARKER_HOURS * HOUR;
}

function placeMatches(event: GlobeEvent, place: string[]): boolean {
  if (place.length === 0) return true;
  const geo = event.geo;
  if (!geo) return false;
  return place.every((value, level) => geo[PLACE_LEVELS[level]] === value);
}

/** Whether an event passes every filter except time. */
export function matchesExceptTime(event: GlobeEvent, state: FilterState): boolean {
  return (
    state.severities.has(event.severity) &&
    event.categories.some((category) => state.categories.has(category)) &&
    placeMatches(event, state.place)
  );
}

/** Whether an event is current at some moment of [from, to]: published by `to`, and published
 * (or still current, `until`) at `from` or later. Without `until`, only the publication time
 * counts. */
export function currentIn(event: GlobeEvent, from: number, to: number): boolean {
  const published = Date.parse(event.published);
  const until = event.until ? Date.parse(event.until) : published;
  return published <= to && Math.max(published, until) >= from;
}

/**
 * An event as the time filter sees it. With "Ongoing events" off (the default) its `until` is
 * left out, so it counts only at its publication time, everywhere: "6 hours" shows only what
 * was published in the last 6 hours (owner, 24 Nov 2026). With it on, a WHO report counts for
 * 14 days and an outage until it ends, as before 1.15.0.
 */
export function timed(event: GlobeEvent, ongoing: boolean): GlobeEvent {
  if (ongoing || event.until === undefined) return event;
  const copy = { ...event };
  delete copy.until;
  return copy;
}

/** Whether an event passes every filter. */
export function matches(event: GlobeEvent, state: FilterState, now: number): boolean {
  const { from, to } = windowOf(state, now);
  return currentIn(timed(event, state.ongoing), from, to) && matchesExceptTime(event, state);
}

export function isDefault(state: FilterState): boolean {
  return (
    state.categories.size === CATEGORIES.length &&
    state.severities.size === SEVERITIES.length &&
    state.range === DEFAULT_RANGE &&
    state.end === null &&
    state.place.length === 0 &&
    !state.ongoing
  );
}

/** The state as web-address parameters (only what differs from the default). */
export function toQuery(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.categories.size !== CATEGORIES.length) {
    params.set('cat', CATEGORIES.filter((c) => state.categories.has(c)).join(',') || 'none');
  }
  if (state.severities.size !== SEVERITIES.length) {
    params.set('sev', SEVERITIES.filter((s) => state.severities.has(s)).join(',') || 'none');
  }
  if (state.range !== DEFAULT_RANGE) params.set('range', state.range);
  if (state.end !== null) params.set('end', new Date(state.end).toISOString().slice(0, 13) + 'Z');
  if (state.place.length) params.set('place', state.place.join('/'));
  if (state.ongoing) params.set('ongoing', '1');
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** The map the site opens on (owner, 24 Nov 2026: Geography is the more convenient start). */
export const DEFAULT_VIEW: MapView = 'geo';

/** Adds the page's own switches to a filter query ("?cat=war" → "?cat=war&view=news&list=1"). */
export function withPageState(query: string, page: { view: MapView; list: boolean }): string {
  const extras = [
    page.view === DEFAULT_VIEW ? '' : `view=${page.view}`,
    page.list ? 'list=1' : '',
  ].filter(Boolean);
  if (extras.length === 0) return query;
  return `${query ? `${query}&` : '?'}${extras.join('&')}`;
}

/** Which map the address asks for; none or anything unknown is the default (Geography). */
export function viewFromQuery(search: string): MapView {
  const view = new URLSearchParams(search).get('view');
  return view === 'news' || view === 'geo' || view === 'atlas' ? view : DEFAULT_VIEW;
}

/** A list from the address; "none" means none chosen, and a missing list or one with no valid
 * value at all (a broken link) gives everything rather than an empty globe. */
function listFrom<T extends string>(value: string | null, allowed: readonly T[]): Set<T> {
  if (value === null) return new Set(allowed);
  if (value === 'none') return new Set();
  const valid = value.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
  return new Set(valid.length ? valid : allowed);
}

/** Reads a state from web-address parameters; unknown or broken values are ignored. */
export function fromQuery(search: string): FilterState {
  const params = new URLSearchParams(search);
  const state = defaultFilters();
  state.categories = listFrom(params.get('cat'), CATEGORIES);
  state.severities = listFrom(params.get('sev'), SEVERITIES);
  const range = params.get('range');
  if (range && range in RANGES) state.range = range as RangeKey;
  const end = params.get('end');
  if (end) {
    const parsed = Date.parse(end.length === 14 ? `${end.slice(0, 13)}:00:00Z` : end);
    if (!Number.isNaN(parsed)) state.end = parsed;
  }
  const place = params.get('place');
  if (place) state.place = place.split('/').filter(Boolean).slice(0, PLACE_LEVELS.length);
  state.ongoing = params.get('ongoing') === '1';
  return state;
}
