import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../types';
import { CATEGORY_ICONS } from './category-icons';
import { GENERIC_CODE, HAZARD_ICONS } from './hazard-icons';

describe('category symbols', () => {
  it('has a symbol of its own for every category', () => {
    expect(Object.keys(CATEGORY_ICONS)).toEqual([...CATEGORIES]);
    const shapes = Object.values(CATEGORY_ICONS).map((icon) => icon.shapes);
    expect(new Set(shapes).size).toBe(CATEGORIES.length);
  });

  it('gives every symbol a main and an accent part, each a path or a circle', () => {
    for (const icon of Object.values(CATEGORY_ICONS)) {
      expect(new Set(icon.shapes.map((s) => s.layer)), icon.code).toEqual(
        new Set(['main', 'accent']),
      );
      for (const shape of icon.shapes)
        expect(Boolean(shape.d) !== Boolean(shape.circle), icon.code).toBe(true);
    }
  });

  it('keeps every circle on the 24×24 grid', () => {
    for (const icon of Object.values(CATEGORY_ICONS)) {
      for (const { circle } of icon.shapes) {
        if (!circle) continue;
        const [x, y, r] = circle;
        for (const n of [x - r, y - r]) expect(n, icon.code).toBeGreaterThanOrEqual(0);
        for (const n of [x + r, y + r]) expect(n, icon.code).toBeLessThanOrEqual(24);
      }
    }
  });

  it('stands for natural disasters with the general warning sign', () => {
    const generic = HAZARD_ICONS.find((icon) => icon.code === GENERIC_CODE)!;
    expect(CATEGORY_ICONS['natural-disasters'].shapes).toBe(generic.shapes);
  });
});
