/** The 14-day timeline, time windows that count only the publication time, and the "Ongoing
 * events" tick box. Made-up events only. */
import { expect, test, type Page } from '@playwright/test';
import { ago, knownWorld, openEvent, openGlobe, syntheticEvent } from './fixtures';

const NOTE = 'Also shows events that began before this time and are still going on';

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
    // A made-up WHO report from 10 days ago, still current for 4 more days (`until`): by default
    // it counts only at its publication time, with "Ongoing events" ticked in every window.
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
  await openGlobe(page, '/?view=news', { events: world() });
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
  await openGlobe(page, '/?view=news', { events: world() });
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
  await openGlobe(page, '/?view=news', { events: world() });
  await page.locator('#filter-toggle').click();
  await chooseTime(page, '14 days', '14d');
  await expect(listed(page, 'old-news')).toHaveCount(1);
  expect(dayFiles.some((url) => url.endsWith('/data/days/index.json'))).toBe(true);
});

test('"Ongoing events" is off by default, and ticked it shows reports still current', async ({
  page,
}) => {
  await openGlobe(page, '/?view=news', { events: world() });
  await page.locator('#filter-toggle').click();
  const box = page.locator('#ongoing-toggle');
  const note = page.locator('#ongoing-note');
  await expect(box).not.toBeChecked();
  await expect(note).toBeHidden();
  await chooseTime(page, '6 h', '6h');
  await expect(listed(page, 'who-old')).toHaveCount(0);

  // Ticked: the explanation shows, the address keeps it, and the old report is back.
  await page.getByText('Ongoing events', { exact: true }).click();
  await expect(box).toBeChecked();
  await expect(note).toBeVisible();
  await expect(note).toContainText(NOTE);
  await expect(note).toContainText('News reports have no end date');
  await expect(page).toHaveURL(/ongoing=1/);
  await expect(listed(page, 'who-old')).toHaveCount(1);
  // News without an end date still counts only when published.
  await expect(listed(page, 'old-news')).toHaveCount(0);
  await openEvent(page, 'who-old');
  await expect(page.locator('#event-card .card-ongoing')).toContainText(
    'Ongoing event: a WHO report counts as current for 14 days after publication',
  );
  await page.keyboard.press('Escape');

  // Unticked again: back to the publication time only.
  await page.locator('#filter-toggle').click();
  await box.uncheck();
  await expect(note).toBeHidden();
  await expect(page).not.toHaveURL(/ongoing=1/);
  await expect(listed(page, 'who-old')).toHaveCount(0);
});

test('a link with "Ongoing events" ticked opens with it ticked', async ({ page }) => {
  await openGlobe(page, '/?ongoing=1&view=news', { events: world() });
  await expect(listed(page, 'who-old')).toHaveCount(1);
  await page.locator('#filter-toggle').click();
  await expect(page.locator('#ongoing-toggle')).toBeChecked();
  await expect(page.locator('#ongoing-note')).toBeVisible();
});

test("an ongoing report's card says nothing about it while the box is off", async ({ page }) => {
  await openGlobe(page, '/?range=14d&view=news', { events: world() });
  await openEvent(page, 'who-old');
  await expect(page.locator('#event-card .card-ongoing')).toHaveCount(0);
});
