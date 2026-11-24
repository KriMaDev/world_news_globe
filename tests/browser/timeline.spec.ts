/** The 14-day timeline, and time windows that count only the publication time. Made-up events
 * only. */
import { expect, test, type Page } from '@playwright/test';
import { ago, knownWorld, openEvent, openGlobe, syntheticEvent } from './fixtures';

const DAY = 24 * 60;

function whoReport(id: string, lat: number, lng: number, minutesAgo: number) {
  return syntheticEvent(id, lat, lng, {
    title: 'Test fever - Testland',
    severity: 'high',
    severity_reason: 'WHO outbreak report on "test" (high by our list)',
    categories: ['health'],
    category_basis: undefined,
    kind: 'data-feed',
    feed: 'who',
    location_method: 'source',
    sources: [{ name: 'World Health Organization', url: 'https://example.org/who' }],
    published: ago(minutesAgo),
    first_seen: ago(minutesAgo),
  });
}

function world() {
  return [
    ...knownWorld(),
    // A made-up WHO report from 10 days ago, with the `until` field that data from before
    // 1.14.1 still carries: it must count only at its publication time.
    {
      ...whoReport('who-old', -2, 23.5, 10 * DAY),
      until: new Date(Date.now() + 4 * DAY * 60_000).toISOString(),
    },
    // A made-up WHO report from 2 hours ago.
    whoReport('who-new', 9, 38.7, 120),
    // A news report from 10 days ago: only in the 14-day window.
    syntheticEvent('old-news', 52.5, 13.4, {
      title: 'Made-up headline from ten days ago',
      published: ago(10 * DAY),
      first_seen: ago(10 * DAY),
    }),
  ];
}

const listed = (page: Page, id: string) => page.locator(`#event-list [data-event-id="${id}"]`);

async function chooseTime(page: Page, label: string, range: string) {
  await page.locator('[data-filter=time] .chip', { hasText: label }).click();
  await expect(page).toHaveURL(new RegExp(`range=${range}`));
}

test('a time window shows only what was published in it, WHO reports too', async ({ page }) => {
  await openGlobe(page, '/', { events: world() });
  // The default 3-day window: the new report only.
  await expect(listed(page, 'who-new')).toHaveCount(1);
  await expect(listed(page, 'who-old')).toHaveCount(0);
  await expect(listed(page, 'old-news')).toHaveCount(0);
  await page.locator('#filter-toggle').click();
  await chooseTime(page, '6 h', '6h');
  await expect(listed(page, 'who-new')).toHaveCount(1);
  await expect(listed(page, 'who-old')).toHaveCount(0);
  await chooseTime(page, '7 days', '7d');
  await expect(listed(page, 'who-old')).toHaveCount(0);
  await chooseTime(page, '14 days', '14d');
  await expect(listed(page, 'who-old')).toHaveCount(1);
  await expect(listed(page, 'old-news')).toHaveCount(1);
});

test("a WHO report's card names WHO and promises no extra days", async ({ page }) => {
  await openGlobe(page, '/', { events: world() });
  await openEvent(page, 'who-new');
  const card = page.locator('#event-card');
  await expect(card.locator('.card-kind')).toContainText('Data feed · WHO');
  await expect(card).toContainText('Official report from the World Health Organization.');
  await expect(card).not.toContainText('14 days');
});

test('the 14-day window shows older events and loads the older days', async ({ page }) => {
  const dayFiles: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/data/days/')) dayFiles.push(request.url());
  });
  await openGlobe(page, '/', { events: world() });
  await page.locator('#filter-toggle').click();
  await chooseTime(page, '14 days', '14d');
  await expect(listed(page, 'old-news')).toHaveCount(1);
  expect(dayFiles.some((url) => url.endsWith('/data/days/index.json'))).toBe(true);
});
