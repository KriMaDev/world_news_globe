import { describe, expect, it } from 'vitest';
import { ShoreIndex } from './shore';

// A made-up square island (2° wide) and a coast running along the date line.
const island = [
  [
    [10, 40],
    [12, 40],
    [12, 42],
    [10, 42],
    [10, 40],
  ],
];
const dateLine = [
  [
    [179.9, -10],
    [-179.9, -12],
  ],
];

describe('ShoreIndex', () => {
  const shore = new ShoreIndex([...island, ...dateLine]);

  it('finds places on and just off the coast, between the points of a long segment', () => {
    expect(shore.near(40, 11)).toBe(true);
    expect(shore.near(41, 12.3)).toBe(true);
    expect(shore.near(39.7, 10.5)).toBe(true);
  });

  it('leaves out places inland or far out at sea', () => {
    expect(shore.near(41, 11)).toBe(false);
    expect(shore.near(45, 11)).toBe(false);
    expect(shore.near(0, 0)).toBe(false);
  });

  it('works across the date line', () => {
    expect(shore.near(-11, 179.95)).toBe(true);
    expect(shore.near(-11, -179.95)).toBe(true);
  });
});
