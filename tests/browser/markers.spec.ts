/**
 * Markers close together stay apart and reachable when zoomed in (owner, 18 Nov 2026: of six
 * stories in one spot, some could not be clicked at the closest zoom). Made-up events only.
 */
import { expect, test, type Page } from '@playwright/test';
import { syntheticEvent, openGlobe } from './fixtures';

const SEVERITIES = ['critical', 'low', 'moderate', 'low', 'high', 'low'];

/** Six stories a few kilometres apart in one made-up country. */
function pile() {
  return SEVERITIES.map((severity, i) =>
    syntheticEvent(`pile-${i}`, 19.6 + (i % 3) * 0.05, -72.2 + Math.floor(i / 3) * 0.05, {
      title: `Made-up headline number ${i}`,
      severity,
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
    }),
  );
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
  await openGlobe(page, '/', { events: pile() });
  if ((await page.locator('#rotate-toggle').getAttribute('aria-pressed')) === 'true') {
    await page.locator('#rotate-toggle').click();
  }
  // The place filter flies straight over the country, so the six are in the middle.
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
  await expect(page.locator('#globe')).toHaveAttribute('data-fanned', '6');
  expect([...(await reachable(page))].sort()).toEqual(
    SEVERITIES.map((_, i) => `Made-up headline number ${i}`),
  );
});
