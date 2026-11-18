/**
 * The symbols for news categories, shown on countries on the Geography map (one per country:
 * the category of its most severe news, rule in docs/severity.md), in the country card and in
 * the legend. Our own simple vector drawings on the same 24×24 grid and in the same style as the
 * disaster symbols (./hazard-icons.ts): a "main" part drawn near-white and an "accent" part drawn
 * in the severity colour. Natural disasters have no symbol of their own here: a country whose
 * main news is a disaster shows that disaster's symbol, as on the News map.
 */

import { CATEGORIES, CATEGORY_LABELS, type Category } from '../types';
import { GENERIC_CODE, HAZARD_ICONS, type HazardIcon, type IconShape } from './hazard-icons';

/** Small filled dots in the accent colour. */
const dots = (points: [number, number][], r: number): IconShape[] =>
  points.map(([x, y]) => ({ circle: [x, y, r], layer: 'accent', fill: true }));

const SHAPES: Record<Exclude<Category, 'natural-disasters'>, IconShape[]> = {
  // War: two crossed swords.
  war: [
    { d: 'M4 4l12.5 12.5M20 4 7.5 16.5', layer: 'main' },
    { d: 'M14.5 18.5l4-4M17.5 17.5l3 3M5.5 14.5l4 4M6.5 17.5l-3 3', layer: 'accent' },
  ],
  // Politics: a group of three people, one in front.
  politics: [
    { circle: [12, 8.6, 3], layer: 'main' },
    { d: 'M6.5 20.5a5.5 5.5 0 0 1 11 0', layer: 'main' },
    { circle: [5, 7.4, 2.2], layer: 'accent' },
    { circle: [19, 7.4, 2.2], layer: 'accent' },
    { d: 'M1.5 16.5a3.8 3.8 0 0 1 5.6-3.3M22.5 16.5a3.8 3.8 0 0 0-5.6-3.3', layer: 'accent' },
  ],
  // Economic: a chart line rising to an arrow, on its axes.
  economic: [
    { d: 'M3.5 3.5v17h17', layer: 'main' },
    { d: 'M7 15.5l4-4.5 3.5 3 5.5-6M15.5 8h4.5v4.5', layer: 'accent' },
  ],
  // Technology advancements: a microchip with three pins a side.
  technology: [
    {
      d: 'M7.5 6h9A1.5 1.5 0 0 1 18 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 16.5v-9A1.5 1.5 0 0 1 7.5 6Z',
      layer: 'main',
    },
    {
      d: 'M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3',
      layer: 'main',
    },
    { d: 'M9.5 9.5h5v5h-5Z', layer: 'accent', fill: true },
  ],
  // Cyber & outages: a chain link broken in two, with sparks at the break.
  cyber: [
    {
      d: 'M9 12.5 6.5 15a2.5 2.5 0 0 0 3.5 3.5l2.5-2.5M15 11.5l2.5-2.5A2.5 2.5 0 0 0 14 5.5l-2.5 2.5',
      layer: 'main',
    },
    { d: 'M7.5 9.2 4.8 8.5M9.2 7.5 8.5 4.8M16.5 14.8l2.7.7M14.8 16.5l.7 2.7', layer: 'accent' },
  ],
  // Health & outbreaks: a virus, six spikes with round tips round a body.
  health: [
    { circle: [12, 12, 5], layer: 'main' },
    {
      d: 'M17.1 14.95l1.48.85M12 17.9v1.7M6.9 14.95l-1.48.85M6.9 9.05l-1.48-.85M12 6.1V4.4M17.1 9.05l1.48-.85',
      layer: 'accent',
    },
    ...dots(
      [
        [19.8, 16.5],
        [12, 21],
        [4.2, 16.5],
        [4.2, 7.5],
        [12, 3],
        [19.8, 7.5],
      ],
      1.6,
    ),
    { circle: [10.4, 11, 1.1], layer: 'main', fill: true },
    { circle: [13.6, 13.4, 0.9], layer: 'main', fill: true },
  ],
  // Climate & environment: a leaf, its midrib running from the stalk to the tip.
  climate: [
    { d: 'M5 19C4 10 10 4 20 4c0 10-6 16-15 15Z', layer: 'main' },
    { d: 'M2.5 21.5 15.5 8.5', layer: 'accent' },
  ],
  // Crime & justice: the scales of justice.
  crime: [
    { d: 'M12 4.5v15M8 20.5h8M4.5 7h15', layer: 'main' },
    { circle: [12, 3.6, 1.3], layer: 'main', fill: true },
    { d: 'M4.5 7 2.2 13.5M4.5 7l2.3 6.5M19.5 7l-2.3 6.5M19.5 7l2.3 6.5', layer: 'accent' },
    {
      d: 'M1.8 13.5h5.4a2.7 2.7 0 0 1-5.4 0ZM16.8 13.5h5.4a2.7 2.7 0 0 1-5.4 0Z',
      layer: 'accent',
      fill: true,
    },
  ],
  // Humanitarian & migration: a shelter tent, seen from its front corner.
  humanitarian: [
    { d: 'M8 7.5 3 20h10ZM8 7.5h9.5l4 12.5H13M1.5 20h21', layer: 'main' },
    { d: 'M8 12.5 6 20h4Z', layer: 'accent', fill: true },
  ],
  // Science & space: a planet with its ring; the ring's far side passes behind the planet.
  science: [
    { circle: [12, 12, 5.2], layer: 'main' },
    {
      d: 'M21.83 8.03A10.6 3.3 -22 0 1 13.24 15.06A10.6 3.3 -22 0 1 2.17 15.97A10.6 3.3 -22 0 1 5.51 11.66M16.43 7.25A10.6 3.3 -22 0 1 21.83 8.03',
      layer: 'accent',
    },
  ],
  // Sport: a trophy cup, its handles meeting the bowl.
  sport: [
    { d: 'M7 4h10v4.5a5 5 0 0 1-10 0ZM12 13.5V17M9.5 17h5l1 3.5h-7Z', layer: 'main' },
    { d: 'M7 6H4v1.5a3.5 3.5 0 0 0 3.7 3.5M17 6h3v1.5a3.5 3.5 0 0 1-3.7 3.5', layer: 'accent' },
  ],
};

/** The general warning sign, standing for natural disasters where no type is known. */
const DISASTER = HAZARD_ICONS.find((icon) => icon.code === GENERIC_CODE)!;

/** One symbol per category, in the order of CATEGORIES. */
export const CATEGORY_ICONS: Record<Category, HazardIcon> = Object.fromEntries(
  CATEGORIES.map((category) => [
    category,
    category === 'natural-disasters'
      ? { ...DISASTER, code: category, label: CATEGORY_LABELS[category] }
      : { code: category, label: CATEGORY_LABELS[category], shapes: SHAPES[category] },
  ]),
) as Record<Category, HazardIcon>;
