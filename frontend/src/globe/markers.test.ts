import { describe, expect, it } from 'vitest';
import { olderDotScale } from './markers';

describe('olderDotScale', () => {
  it('is full size at 3 days and smallest from 13 days', () => {
    expect(olderDotScale(3)).toBe(1);
    expect(olderDotScale(13)).toBeCloseTo(0.6);
    expect(olderDotScale(20)).toBeCloseTo(0.6);
    expect(olderDotScale(0)).toBe(1);
  });

  it('is one step smaller for every day in between (14 days: a size per day)', () => {
    const sizes = Array.from({ length: 11 }, (_, i) => olderDotScale(3 + i));
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]!).toBeLessThan(sizes[i - 1]!);
      expect(sizes[i - 1]! - sizes[i]!).toBeCloseTo(0.04);
    }
  });
});
