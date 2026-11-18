/**
 * Markers close together stay apart and reachable when zoomed in (owner, 18 Nov 2026: of six
 * stories in one spot, some could not be clicked at the closest zoom). Made-up events only.
 */
import { expect, test, type Page } from '@playwright/test';
import { altitude, openGlobe, syntheticEvent } from './fixtures';

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
  await openGlobe(page, '/', { events });
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
  await page.waitForTimeout(1500);
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
  // The tests block NASA's tiles: the zoom still goes all the way in (it used to stop at 0.5
  // until a tile had loaded).
  expect(await altitude(page)).toBeLessThan(0.2);
  await expect(page.locator('#globe')).toHaveAttribute('data-fanned', '6');
  expect([...(await reachable(page))].sort()).toEqual(
    SEVERITIES.map((_, i) => `Made-up headline number ${i}`),
  );
});

test('in a pile too big to spread out, the newest stories keep their own pillars', async ({
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
  for (const newest of [8, 7, 6, 5, 4])
    expect(reached).toContain(`Made-up headline number ${newest}`);
  // The four oldest (with the critical one) are one group with a count.
  await expect(page.locator('.cluster-badge', { hasText: '4' })).toHaveCount(1);
});
