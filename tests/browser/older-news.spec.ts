/**
 * Less crowding with long windows (owner, 19 Nov 2026): with more than 3 days, news older than
 * the last 3 days of the window is a small dot, and count badges that would sit on top of each
 * other are hidden. Made-up events only.
 */
import { expect, test, type Page } from '@playwright/test';
import { openGlobe, settledView, syntheticEvent } from './fixtures';

const HOUR = 3_600_000;
const hoursAgo = (hours: number): string => new Date(Date.now() - hours * HOUR).toISOString();
const at = (hours: number) => ({ published: hoursAgo(hours), first_seen: hoursAgo(hours) });

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

/** Two new stories and three older ones (one a group of two), far apart. */
function mixedAges() {
  return [
    syntheticEvent('new-a', 48, 2, at(2)),
    syntheticEvent('new-b', -30, 140, at(30)),
    syntheticEvent('old-a', 10, -60, at(5 * 24)),
    syntheticEvent('old-b', -20, 30, at(9 * 24)),
    syntheticEvent('old-group-1', 35, 100, at(6 * 24)),
    syntheticEvent('old-group-2', 35.1, 100.1, at(7 * 24)),
  ];
}

async function chooseRange(page: Page, label: string): Promise<void> {
  await page.locator('#filter-toggle').click();
  await page.locator('[data-filter=time] .chip', { hasText: label }).click();
  await page.locator('#filter-toggle').click();
}

test('with 14 days, older news is a small dot and the legend says so; 3 days has none', async ({
  page,
}) => {
  await openGlobe(page, '/?range=14d', { events: mixedAges() });
  const globe = page.locator('#globe');
  await expect(globe).toHaveAttribute('data-older', '3');
  await expect(page.locator('.legend-older')).not.toHaveCSS('display', 'none');
  await expect(page.locator('.legend-older')).toContainText('Older news');

  await chooseRange(page, '3 days');
  await expect(page).toHaveURL(/^(?!.*range=)/);
  await expect(globe).toHaveAttribute('data-older', '0');
  await expect(page.locator('.legend-older')).toHaveCSS('display', 'none');
});

test('the line moves with the window: 3 days before its end', async ({ page }) => {
  const events = [
    syntheticEvent('four-days', 20, 0, at(4 * 24)),
    syntheticEvent('six-days', -20, 60, at(6 * 24)),
  ];
  // Ends now: both are older than 3 days.
  await openGlobe(page, '/?range=7d', { events });
  await expect(page.locator('#globe')).toHaveAttribute('data-older', '2');
  // Ends 2 days ago: four days ago is within its last 3 days, six days ago is not.
  const end = new Date(Date.now() - 48 * HOUR).toISOString().slice(0, 13) + 'Z';
  await page.goto(`/?range=7d&end=${end}`);
  await expect(page.locator('#globe')).toHaveAttribute('data-older', '1');
});

test('an older dot still opens its card', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Finding the marker needs a mouse; phones tap the same markers');
  test.setTimeout(120_000);
  const events = [
    syntheticEvent('old-dot', 19.6, -72.2, {
      ...TESTLAND,
      ...at(8 * 24),
      title: 'Made-up older headline',
    }),
  ];
  await openGlobe(page, '/?range=14d', { events });
  if ((await page.locator('#rotate-toggle').getAttribute('aria-pressed')) === 'true') {
    await page.locator('#rotate-toggle').click();
  }
  await expect(page.locator('#globe')).toHaveAttribute('data-older', '1');
  await page.locator('#filter-toggle').click();
  for (const value of ['Americas', 'Caribbean', 'TL']) {
    await page.locator('[data-filter=place] .place-select').selectOption(value);
  }
  await page.locator('#filter-toggle').click();
  await settledView(page);
  // Find the dot by its hover label, then click it there.
  const size = page.viewportSize()!;
  let spot: { x: number; y: number } | null = null;
  search: for (let gy = -6; gy <= 6; gy += 1) {
    for (let gx = -8; gx <= 8; gx += 1) {
      const point = { x: size.width / 2 + gx * 8, y: size.height / 2 + gy * 8 };
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(120); // globe.gl looks under the pointer about every 50 ms
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
  await expect(page.locator('#event-card-title')).toHaveText('Made-up older headline');
});

test('count badges never sit on top of each other', async ({ page }) => {
  test.setTimeout(120_000);
  // Pairs of stories (so each is a group with a badge) on a 5° grid over Europe: closer on
  // screen than a badge is wide, but too far apart to be grouped.
  const events = [];
  for (let lat = 35; lat <= 65; lat += 5) {
    for (let lng = -10; lng <= 40; lng += 5) {
      events.push(syntheticEvent(`p-${lat}-${lng}-a`, lat, lng));
      events.push(syntheticEvent(`p-${lat}-${lng}-b`, lat + 0.1, lng + 0.1));
    }
  }
  await openGlobe(page, '/', { events });
  if ((await page.locator('#rotate-toggle').getAttribute('aria-pressed')) === 'true') {
    await page.locator('#rotate-toggle').click();
  }
  await page.locator('#filter-toggle').click();
  await page.locator('[data-filter=place] .place-select').first().selectOption('Europe');
  await page.locator('#filter-toggle').click();
  await settledView(page);
  // Further out, so the badges stand close together on every screen size.
  for (let step = 0; step < 2; step += 1) {
    await page.evaluate(() => document.getElementById('zoom-out')?.click());
    await page.waitForTimeout(400);
  }
  await settledView(page);
  await page.waitForTimeout(500); // the badges are checked about every 120 ms

  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.cluster-badge')]
      .filter((badge) => !badge.matches('.is-hidden'))
      .map((badge) => {
        const r = badge.getBoundingClientRect();
        return { crowded: badge.matches('.is-crowded'), box: [r.left, r.top, r.right, r.bottom] };
      }),
  );
  const shown = boxes.filter((b) => !b.crowded).map((b) => b.box);
  expect(shown.length).toBeGreaterThan(5);
  // Some had to make room, and none of those left overlaps another (1 px rounding allowed).
  expect(boxes.some((b) => b.crowded)).toBe(true);
  for (let i = 0; i < shown.length; i += 1) {
    for (let j = i + 1; j < shown.length; j += 1) {
      const [a, b] = [shown[i]!, shown[j]!];
      const overlap = a[0] < b[2] - 1 && a[2] > b[0] + 1 && a[1] < b[3] - 1 && a[3] > b[1] + 1;
      expect(overlap, `badges ${i} and ${j} overlap`).toBe(false);
    }
  }
});
