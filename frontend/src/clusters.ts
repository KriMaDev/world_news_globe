/**
 * Grouping nearby events into one pillar, so busy places (e.g. India) stay readable.
 *
 * Rule (docs/severity.md, "Groups"): seen from far away, events within 4° of a group's lead
 * join it; closer in, 2°, then 1°; zoomed right in, no grouping. The lead is the most severe
 * event (then the newest), the group stands at the lead's place and takes its severity. A
 * group of one is just that event. Natural disasters (drawn as symbols) and other events
 * (pillars of light) are grouped separately, so a group is always one or the other.
 */

import { isDisaster } from './globe/hazard-icons';
import { SEVERITIES, type GlobeEvent, type Severity } from './types';

export interface Cluster {
  /** "event id" for a single event, "group:" + lead id for a group. */
  id: string;
  lead: GlobeEvent;
  /** Every event in the group, most severe and newest first. */
  events: GlobeEvent[];
  /** Where the marker stands: the true place, unless it has been fanned out. */
  lat: number;
  lng: number;
  severity: Severity;
  /** The true place of a marker moved aside by fanOut (a thin line joins the two). */
  anchor?: { lat: number; lng: number };
}

/** Grouping distance in degrees for a camera altitude (globe radii above the surface). */
export function clusterDegrees(altitude: number): number {
  // Steps fit the zoom limits (closest 0.5, or 0.9 on phones: see globe/globe.ts), so
  // grouping always ends before the closest zoom.
  if (altitude >= 2) return 4;
  if (altitude >= 1.4) return 2;
  if (altitude >= 1) return 1;
  return 0;
}

const RAD = Math.PI / 180;

/** The angle between two points on the globe, in degrees. */
export function angularDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const dp = p2 - p1;
  const dl = (lng2 - lng1) * RAD;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / RAD;
}

/** Most severe first, then newest, then by id (so grouping never depends on input order). */
export function leadOrder(a: GlobeEvent, b: GlobeEvent): number {
  const bySeverity = SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity);
  if (bySeverity !== 0) return bySeverity;
  const byTime = Date.parse(b.published) - Date.parse(a.published);
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
}

/** Groups events within `degrees` of a more important event (0: no grouping). */
export function clusterEvents(events: GlobeEvent[], degrees: number): Cluster[] {
  if (degrees <= 0) return groupNearby(events, degrees);
  const disasters = groupNearby(events.filter(isDisaster), degrees);
  const others = groupNearby(
    events.filter((event) => !isDisaster(event)),
    degrees,
  );
  return [...disasters, ...others].sort((a, b) => leadOrder(a.lead, b.lead));
}

/** Groups events of one kind (see clusterEvents). */
function groupNearby(events: GlobeEvent[], degrees: number): Cluster[] {
  const sorted = [...events].sort(leadOrder);
  const single = (event: GlobeEvent): Cluster => ({
    id: event.id,
    lead: event,
    events: [event],
    lat: event.lat,
    lng: event.lng,
    severity: event.severity,
  });
  if (degrees <= 0) return sorted.map(single);

  const clusters: Cluster[] = [];
  const grid = new Map<string, Cluster[]>();
  const cellOf = (lat: number, lng: number): [number, number] => [
    Math.floor(lat / degrees),
    Math.floor(lng / degrees),
  ];
  const lngCells = Math.ceil(360 / degrees);
  for (const event of sorted) {
    const [row, col] = cellOf(event.lat, event.lng);
    let home: Cluster | undefined;
    search: for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const wrapped =
          ((((col + dc + lngCells / 2) % lngCells) + lngCells) % lngCells) - lngCells / 2;
        for (const cluster of grid.get(`${row + dr}:${wrapped}`) ?? []) {
          if (angularDistance(event.lat, event.lng, cluster.lat, cluster.lng) <= degrees) {
            home = cluster;
            break search;
          }
        }
      }
    }
    if (home) {
      home.events.push(event);
      if (home.events.length === 2) home.id = `group:${home.lead.id}`;
      continue;
    }
    const cluster = single(event);
    clusters.push(cluster);
    const key = `${row}:${((((col + lngCells / 2) % lngCells) + lngCells) % lngCells) - lngCells / 2}`;
    grid.set(key, [...(grid.get(key) ?? []), cluster]);
  }
  return clusters;
}

/** The most markers a pile is fanned out into: one ring. A bigger pile spread over several
 * rings reached far from its place, and neighbouring piles' lines crossed into a web (seen over
 * Britain, 18 Nov 2026). */
export const MAX_FAN = 6;

/** A pile too big to fan out, as one group per kind (disaster symbols and pillars stay
 * apart, as in clusterEvents): it opens as a list, and splits up as the zoom comes closer. */
function mergeByKind(stack: Cluster[]): Cluster[] {
  const kinds = [stack.filter((c) => isDisaster(c.lead)), stack.filter((c) => !isDisaster(c.lead))];
  return kinds
    .filter((kind) => kind.length > 0)
    .map((kind) => {
      if (kind.length === 1) return kind[0]!;
      const events = kind.flatMap((cluster) => cluster.events).sort(leadOrder);
      const lead = events[0]!;
      return {
        id: `group:${lead.id}`,
        lead,
        events,
        lat: lead.lat,
        lng: lead.lng,
        severity: lead.severity,
      };
    });
}

/**
 * Zoomed right in, markers closer than `spacing` degrees (or at the very same place) can't each
 * be tapped, so they move apart in a ring around their middle, each on its own side and
 * remembering its true place.
 * A pile of more than MAX_FAN stays a group instead. Markers with room are left alone. A
 * `spacing` of 0 does nothing.
 */
export function fanOut(clusters: Cluster[], spacing: number): Cluster[] {
  if (spacing <= 0) return clusters;
  const stacks: Cluster[][] = [];
  const grid = new Map<string, Cluster[][]>();
  const cell = (value: number): number => Math.floor(value / spacing);
  for (const cluster of clusters) {
    const row = cell(cluster.lat);
    const col = cell(cluster.lng);
    let home: Cluster[] | undefined;
    search: for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        for (const stack of grid.get(`${row + dr}:${col + dc}`) ?? []) {
          const first = stack[0]!;
          if (angularDistance(cluster.lat, cluster.lng, first.lat, first.lng) < spacing) {
            home = stack;
            break search;
          }
        }
      }
    }
    if (home) {
      home.push(cluster);
      continue;
    }
    const stack = [cluster];
    stacks.push(stack);
    const key = `${row}:${col}`;
    grid.set(key, [...(grid.get(key) ?? []), stack]);
  }
  return stacks.flatMap((pile) => {
    const stack = pile.length > MAX_FAN ? mergeByKind(pile) : pile;
    if (stack.length === 1) return stack;
    const lat = stack.reduce((sum, c) => sum + c.lat, 0) / stack.length;
    const lng = stack.reduce((sum, c) => sum + c.lng, 0) / stack.length;
    const narrowing = Math.max(0.1, Math.cos(lat * RAD));
    // Each marker takes the slot on its own side of the middle, in order around the ring, so
    // the lines to the true places stay short and never cross. Markers at the very same
    // place keep their order (most severe first, from the north).
    const bearing = (c: Cluster): number => Math.atan2((c.lng - lng) * narrowing, c.lat - lat);
    const together = stack.every((c) => c.lat === stack[0]!.lat && c.lng === stack[0]!.lng);
    const order = together ? stack : [...stack].sort((a, b) => bearing(a) - bearing(b));
    const start = together ? 0 : bearing(order[0]!);
    return order.map((cluster, index) => {
      const angle = start + (2 * Math.PI * index) / order.length;
      return {
        ...cluster,
        lat: Math.max(-89, Math.min(89, lat + spacing * Math.cos(angle))),
        lng: lng + (spacing * Math.sin(angle)) / narrowing,
        anchor: { lat: cluster.lat, lng: cluster.lng },
      };
    });
  });
}

/** The group that contains an event, if any. */
export function clusterOf(clusters: Cluster[], eventId: string): Cluster | undefined {
  return clusters.find((cluster) => cluster.events.some((event) => event.id === eventId));
}
