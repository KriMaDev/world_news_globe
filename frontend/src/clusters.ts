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

/** Slots tried around a marker's true place when it is taken: one ring of six. A second, wider
 * ring made long lines that crossed into a web (seen over Britain, 18 Nov 2026). */
export const RING_SLOTS = 6;
/** Markers closer than this share of the spacing count as overlapping. */
const OVERLAP = 0.9;
/** How far (in spacings) a story that found no slot looks for a group to join. */
const JOIN_REACH = 2.5;

const newestFirst = (a: Cluster, b: Cluster): number =>
  Date.parse(b.lead.published) - Date.parse(a.lead.published) || a.id.localeCompare(b.id);

/** One marker being laid out: where it stands and what it holds. */
interface Placed {
  lat: number;
  lng: number;
  /** Where its first story really is (a line joins the two when they differ). */
  home: { lat: number; lng: number };
  disaster: boolean;
  clusters: Cluster[];
}

/**
 * Zoomed right in, markers closer than `spacing` degrees (about 60 px on screen) can't each be
 * tapped, so they are laid out like pins on a map, newest first (owner, 18 Nov 2026: the newest
 * must never be hidden in a group, and every marker must stay clickable):
 * 1. each story stands at its true place if that is free, else in the nearest free slot of a
 *    ring around it, with a thin line back to its place;
 * 2. a story that finds no free slot joins the nearest group of its kind (disaster symbols and
 *    pillars stay apart, as in clusterEvents); without one, the oldest nearby story of its kind
 *    becomes a group holding both, in that story's slot.
 * So no two markers overlap, the newest stand alone, and groups form only where room runs
 * out; a group opens as a list and splits up as the zoom comes closer. A `spacing` of 0 does
 * nothing.
 */
export function fanOut(clusters: Cluster[], spacing: number): Cluster[] {
  if (spacing <= 0) return clusters;
  const minimum = spacing * OVERLAP;
  const placed: Placed[] = [];
  const grid = new Map<string, Placed[]>();
  const keyOf = (lat: number, lng: number): [number, number] => [
    Math.floor(lat / spacing),
    Math.floor(lng / spacing),
  ];
  /** Placed markers within `distance` of a point. */
  const near = (lat: number, lng: number, distance: number): Placed[] => {
    const [row, col] = keyOf(lat, lng);
    const rows = Math.ceil(distance / spacing);
    const cols = Math.ceil(rows / Math.max(0.1, Math.cos(lat * RAD)));
    const found: Placed[] = [];
    for (let dr = -rows; dr <= rows; dr += 1) {
      for (let dc = -cols; dc <= cols; dc += 1) {
        for (const other of grid.get(`${row + dr}:${col + dc}`) ?? []) {
          if (angularDistance(lat, lng, other.lat, other.lng) < distance) found.push(other);
        }
      }
    }
    return found;
  };
  const put = (marker: Placed): void => {
    placed.push(marker);
    const key = keyOf(marker.lat, marker.lng).join(':');
    grid.set(key, [...(grid.get(key) ?? []), marker]);
  };
  /** The true place if free, else the first free slot around it, else null. */
  const freeSpot = (lat: number, lng: number): { lat: number; lng: number } | null => {
    const narrowing = Math.max(0.1, Math.cos(lat * RAD));
    const spots = [{ lat, lng }];
    for (let slot = 0; slot < RING_SLOTS; slot += 1) {
      const angle = (2 * Math.PI * slot) / RING_SLOTS;
      spots.push({
        lat: Math.max(-89, Math.min(89, lat + spacing * Math.cos(angle))),
        lng: lng + (spacing * Math.sin(angle)) / narrowing,
      });
    }
    return spots.find((spot) => near(spot.lat, spot.lng, minimum).length === 0) ?? null;
  };

  for (const cluster of [...clusters].sort(newestFirst)) {
    const disaster = isDisaster(cluster.lead);
    const spot = freeSpot(cluster.lat, cluster.lng);
    if (spot) {
      put({ ...spot, home: { lat: cluster.lat, lng: cluster.lng }, disaster, clusters: [cluster] });
      continue;
    }
    const kin = near(cluster.lat, cluster.lng, spacing * JOIN_REACH).filter(
      (other) => other.disaster === disaster,
    );
    const distance = (other: Placed): number =>
      angularDistance(cluster.lat, cluster.lng, other.home.lat, other.home.lng);
    const group = kin
      .filter((other) => other.clusters.length > 1)
      .sort((a, b) => distance(a) - distance(b))[0];
    // Everything nearby is newer than this story, so the oldest of them gives up its own pin.
    const oldest = kin.sort((a, b) => newestFirst(a.clusters[0]!, b.clusters[0]!)).at(-1);
    const host = group ?? oldest;
    if (host) host.clusters.push(cluster);
    // No room and nothing of its kind nearby (rare): it stands at its place; a click there
    // lists every marker under it (markersUnder).
    else {
      const home = { lat: cluster.lat, lng: cluster.lng };
      put({ ...home, home, disaster, clusters: [cluster] });
    }
  }

  return placed.map((marker) => {
    const moved = marker.lat !== marker.home.lat || marker.lng !== marker.home.lng;
    const anchor = moved ? { anchor: { ...marker.home } } : {};
    if (marker.clusters.length === 1) {
      return { ...marker.clusters[0]!, lat: marker.lat, lng: marker.lng, ...anchor };
    }
    const events = marker.clusters.flatMap((cluster) => cluster.events).sort(leadOrder);
    const lead = events[0]!;
    return {
      id: `group:${lead.id}`,
      lead,
      events,
      lat: marker.lat,
      lng: marker.lng,
      severity: lead.severity,
      ...anchor,
    };
  });
}

/**
 * What a click on marker `hit` opens: `hit` itself, or, when other markers stand within
 * `reach` pixels of it on screen (`screenOf` projects a marker), one list of all their events.
 * Markers that touch (in a tilted view, or a crowd the layout could not part) are then never
 * out of reach (owner, 18 Nov 2026: of two touching markers only one could be clicked).
 */
export function markersUnder(
  hit: Cluster,
  clusters: Cluster[],
  screenOf: (cluster: Cluster) => { x: number; y: number },
  reach: number,
): Cluster {
  const at = screenOf(hit);
  const near = clusters.filter((cluster) => {
    if (cluster === hit) return true;
    // Only markers on this side of the globe, close by.
    if (angularDistance(cluster.lat, cluster.lng, hit.lat, hit.lng) > 10) return false;
    const there = screenOf(cluster);
    return Math.hypot(there.x - at.x, there.y - at.y) < reach;
  });
  if (near.length < 2) return hit;
  const events = near.flatMap((cluster) => cluster.events).sort(leadOrder);
  const lead = events[0]!;
  return {
    id: `here:${lead.id}`,
    lead,
    events,
    lat: hit.lat,
    lng: hit.lng,
    severity: lead.severity,
  };
}

/** The group that contains an event, if any. */
export function clusterOf(clusters: Cluster[], eventId: string): Cluster | undefined {
  return clusters.find((cluster) => cluster.events.some((event) => event.id === eventId));
}

/** Whether every event of a group is older than `recentFrom` (counting reports that stay
 * current until later, `until`), so its marker is drawn as a small dot. Never with null. */
export function isOlder(cluster: Cluster, recentFrom: number | null): boolean {
  if (recentFrom === null) return false;
  return cluster.events.every((event) => {
    const published = Date.parse(event.published);
    const until = event.until ? Date.parse(event.until) : published;
    return Math.max(published, until) < recentFrom;
  });
}
