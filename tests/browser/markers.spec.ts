/**
 * Markers close together stay apart and reachable when zoomed in (owner, 18 Nov 2026: of six
 * stories in one spot, some could not be clicked at the closest zoom). Made-up events only.
 */
import { expect, test, type Page } from '@playwright/test';
import { altitude, openGlobe, settledView, syntheticEvent } from './fixtures';

const SEVERITIES = ['critical', 'low', 'moderate', 'low', 'high', 'low'];

const TESTLAND = {
  place: 'Testland',
  geo: {
    continent: 'Americas',
    region: 'Caribbean',
    country: 'Testland',
    country_code: 'TL',
    admin1: null,
    city: null,
    precision: 'country',
  },
};

/** Six stories a few kilometres apart in one made-up country. */
function pile() {
  return SEVERITIES.map((severity, i) =>
    syntheticEvent(`pile-${i}`, 19.6 + (i % 3) * 0.05, -72.2 + Math.floor(i / 3) * 0.05, {
      ...TESTLAND,
      title: `Made-up headline number ${i}`,
      severity,
    }),
  );
}

/** Opens the globe on `events`, flies straight over Testland and zooms all the way in. */
async function zoomIntoTestland(page: Page, events: ReturnType<typeof pile>): Promise<void> {
  await openGlobe(page, '/?view=news', { events });
  if ((await page.locator('#rotate-toggle').getAttribute('aria-pressed')) === 'true') {
    await page.locator('#rotate-toggle').click();
  }
  // The place filter flies straight over the country, so its events are in the middle.
  await page.locator('#filter-toggle').click();
  for (const value of ['Americas', 'Caribbean', 'TL']) {
    await page.locator('[data-filter=place] .place-select').selectOption(value);
  }
  await page.locator('#filter-toggle').click();
  await page.waitForTimeout(2500);
  for (let step = 0; step < 8; step += 1) {
    await page.evaluate(() => document.getElementById('zoom-in')?.click());
    await page.waitForTimeout(400);
  }
  // The tests block NASA's tiles: the zoom still goes all the way in (it used to stop at 0.5
  // until a tile had loaded). Wait for the camera to arrive and stop before hovering.
  // The readout rounds to one decimal: the closest zoom, 0.15, can read 0.2.
  await expect.poll(() => altitude(page), { timeout: 20_000 }).toBeLessThan(0.3);
  await settledView(page);
}

/** Headlines whose hover label shows somewhere in a grid around the middle of the screen. */
async function reachable(page: Page): Promise<Set<string>> {
  const found = new Set<string>();
  const size = page.viewportSize()!;
  for (let gx = -5; gx <= 5; gx += 1) {
    for (let gy = -5; gy <= 5; gy += 1) {
      await page.mouse.move(size.width / 2 + gx * 20, size.height / 2 + gy * 20);
      await page.waitForTimeout(150); // globe.gl looks under the pointer about every 50 ms
      const label = await page.evaluate(() => {
        const tip = document.querySelector('.float-tooltip-kap');
        return tip && getComputedStyle(tip).display !== 'none' ? (tip.textContent ?? '') : '';
      });
      const title = /Made-up headline number \d/.exec(label)?.[0];
      if (title) found.add(title);
    }
  }
  return found;
}

test('six stories in one spot can each be reached at the closest zoom', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Hovering needs a mouse; phones tap the same markers');
  test.setTimeout(120_000);
  await zoomIntoTestland(page, pile());
  // The newest keeps its true place; the other five move aside.
  await expect(page.locator('#globe')).toHaveAttribute('data-fanned', '5');
  expect([...(await reachable(page))].sort()).toEqual(
    SEVERITIES.map((_, i) => `Made-up headline number ${i}`),
  );
});

test('where room runs out, the newest stories keep their own pillars', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Hovering needs a mouse; phones tap the same markers');
  test.setTimeout(120_000);
  // Nine stories at the very same place; number 8 is the newest, number 0 the oldest.
  const events = Array.from({ length: 9 }, (_, i) =>
    syntheticEvent(`same-${i}`, 19.6, -72.2, {
      ...TESTLAND,
      title: `Made-up headline number ${i}`,
      severity: i === 0 ? 'critical' : 'low',
      published: new Date(Date.now() - (60 - i) * 60_000).toISOString(),
      first_seen: new Date(Date.now() - (60 - i) * 60_000).toISOString(),
    }),
  );
  await zoomIntoTestland(page, events);
  const reached = await reachable(page);
  for (const newest of [8, 7, 6, 5, 4, 3])
    expect(reached).toContain(`Made-up headline number ${newest}`);
  // The place and its ring hold seven: the three oldest (with the critical one) share a group.
  await expect(page.locator('.cluster-badge', { hasText: '3' })).toHaveCount(1);
});

test('a click on a marker with no other near it opens its own card', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Finding the marker needs a mouse; phones get a wider reach');
  test.setTimeout(120_000);
  // Two stories about 1.3° apart: separate markers about 140 px apart at country level
  // (altitude 1). Touching markers open a list instead (unit tests: markersUnder).
  const events = [
    syntheticEvent('near-a', 19.6, -72.2, { ...TESTLAND, title: 'Made-up headline number 1' }),
    syntheticEvent('near-b', 19.6, -70.9, { ...TESTLAND, title: 'Made-up headline number 2' }),
  ];
  await openGlobe(page, '/?view=news', { events });
  if ((await page.locator('#rotate-toggle').getAttribute('aria-pressed')) === 'true') {
    await page.locator('#rotate-toggle').click();
  }
  await page.locator('#filter-toggle').click();
  for (const value of ['Americas', 'Caribbean', 'TL']) {
    await page.locator('[data-filter=place] .place-select').selectOption(value);
  }
  await page.locator('#filter-toggle').click();
  await settledView(page);
  // Find a marker by its hover label, then click it there.
  const size = page.viewportSize()!;
  let spot: { x: number; y: number } | null = null;
  search: for (let gy = -6; gy <= 6; gy += 1) {
    for (let gx = -8; gx <= 8; gx += 1) {
      const point = { x: size.width / 2 + gx * 8, y: size.height / 2 + gy * 8 };
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(120);
      const shown = await page.evaluate(() => {
        const tip = document.querySelector('.float-tooltip-kap');
        return !!tip && getComputedStyle(tip).display !== 'none' && !!tip.textContent;
      });
      if (shown) {
        spot = point;
        break search;
      }
    }
  }
  expect(spot).not.toBeNull();
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(page.locator('#event-card-title')).toHaveText(/^Made-up headline number [12]$/);
});
