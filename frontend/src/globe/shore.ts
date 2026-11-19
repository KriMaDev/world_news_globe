/**
 * Which places stand on a shore or an island (owner, 19 Nov 2026). There a low-severity marker
 * gets the clear look (./markers.ts): its blue glow is lost on the blue coast lines and in
 * bright coastal cities. Built from the coastlines in lines.bin as a grid of small cells that a
 * coastline passes through; a place is on the shore when one of those cells lies within
 * `REACH` cells of its own (about 45 to 65 km).
 */
const CELL = 0.2;
const REACH = 2;
/** Long coastline segments are walked in steps this small (degrees), so no cell is skipped. */
const STEP = 0.1;
const COLUMNS = Math.round(360 / CELL);

const row = (lat: number): number => Math.floor((lat + 90) / CELL);
const column = (lng: number): number => Math.floor((lng + 180) / CELL);
/** One number per cell; columns wrap around the date line. */
const key = (r: number, c: number): number => r * COLUMNS + (((c % COLUMNS) + COLUMNS) % COLUMNS);

export class ShoreIndex {
  private readonly cells = new Set<number>();

  /** `coastlines`: lines of [lng, lat] points (./lines.ts, parseLines). */
  constructor(coastlines: number[][][]) {
    for (const line of coastlines) {
      line.forEach(([lng, lat], index) => {
        this.mark(lat!, lng!);
        const next = line[index + 1];
        if (!next) return;
        let dLng = next[0]! - lng!;
        if (dLng > 180) dLng -= 360;
        else if (dLng < -180) dLng += 360;
        const dLat = next[1]! - lat!;
        const steps = Math.ceil(Math.max(Math.abs(dLng), Math.abs(dLat)) / STEP);
        for (let s = 1; s < steps; s += 1) {
          this.mark(lat! + (dLat * s) / steps, lng! + (dLng * s) / steps);
        }
      });
    }
  }

  private mark(lat: number, lng: number): void {
    this.cells.add(key(row(lat), column(lng)));
  }

  /** Whether a coastline passes near the place. */
  near(lat: number, lng: number): boolean {
    const r = row(lat);
    const c = column(lng);
    for (let dr = -REACH; dr <= REACH; dr += 1) {
      for (let dc = -REACH; dc <= REACH; dc += 1) {
        if (this.cells.has(key(r + dr, c + dc))) return true;
      }
    }
    return false;
  }
}
