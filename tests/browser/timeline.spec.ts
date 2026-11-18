/** The 14-day timeline and reports that stay current (WHO outbreak reports). Made-up events only. */
import { expect, test, type Page } from '@playwright/test';
import { ago, knownWorld, openEvent, openGlobe, syntheticEvent } from './fixtures';

const DAY = 24 * 60;

function world() {
  return [
    ...knownWorld(),
    // A made-up WHO report from 10 days ago: still current for 4 more days.
    syntheticEvent('who-cd', -2, 23.5, {
      title: 'Test fever - Testland',
      severity: 'high',
      severity_reason: 'WHO outbreak report on "test" (high by our list)',
      categories: ['health'],
      category_basis: undefined,
      kind: 'data-feed',
      feed: 'who',
      location_method: 'source',
      sources: [{ name: 'World Health Organization', url: 'https://example.org/who' }],
      published: ago(10 * DAY),
      first_seen: ago(10 * DAY),
      until: new Date(Date.now() + 4 * DAY * 60_000).toISOString(),
    }),
    // A news report from 10 days ago: only in the 14-day window.
    syntheticEvent('old-news', 52.5, 13.4, {
      title: 'Made-up headline from ten days ago',
      published: ago(10 * DAY),
      first_seen: ago(10 * DAY),
    }),
  ];
}

const listed = (page: Page, id: string) => page.locator(`#event-list [data-event-id="${id}"]`);

test('a WHO report stays on the globe for 14 days, and its card says so', async ({ page }) => {
  await openGlobe(page, '/', { events: world() });
  // The default 3-day window: the report is current, the old news is not.
  await expect(listed(page, 'who-cd')).toHaveCount(1);
  await expect(listed(page, 'old-news')).toHaveCount(0);
  await openEvent(page, 'who-cd');
  const card = page.locator('#event-card');
  await expect(card.locator('.card-kind')).toContainText('Data feed · WHO');
  await expect(card).toContainText(
    'Official report from the World Health Organization, shown for 14 days after publication.',
  );
});

test('the 14-day window shows older events and loads the older days', async ({ page }) => {
  const dayFiles: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/data/days/')) dayFiles.push(request.url());
  });
  await openGlobe(page, '/', { events: world() });
  await page.locator('#filter-toggle').click();
  await page.locator('[data-filter=time] .chip', { hasText: '14 days' }).click();
  await expect(page).toHaveURL(/range=14d/);
  await expect(listed(page, 'old-news')).toHaveCount(1);
  expect(dayFiles.some((url) => url.endsWith('/data/days/index.json'))).toBe(true);
});
