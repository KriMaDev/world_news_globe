import { describe, expect, it } from 'vitest';
import { defaultFilters } from '../filters';
import { hoursBack, maxHoursBack } from './timeline';

const NOW = Date.parse('2026-11-08T12:00:00Z');

describe('timeline maths', () => {
  it('counts whole hours back from now', () => {
    const state = defaultFilters();
    expect(hoursBack(state, NOW)).toBe(0);
    state.end = NOW - 5 * 3_600_000;
    expect(hoursBack(state, NOW)).toBe(5);
  });

  it('never lets the window reach past the 14 days of data', () => {
    expect(maxHoursBack('6h')).toBe(330);
    expect(maxHoursBack('3d')).toBe(264);
    expect(maxHoursBack('7d')).toBe(168);
    expect(maxHoursBack('14d')).toBe(0);
  });
});
