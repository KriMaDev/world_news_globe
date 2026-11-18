/** Cyber & outages and Cloudflare Radar's outage feed. Made-up events only. */
import { expect, test, type Page } from '@playwright/test';
import { knownWorld, openEvent, openGlobe, syntheticEvent } from './fixtures';

function world() {
  return [
    ...knownWorld(),
    syntheticEvent('radar-tl', 9, 38.7, {
      title: 'Internet outage in Testland: government directed (nationwide)',
      snippet: 'Made-up description of a test outage.',
      severity: 'critical',
      severity_reason: 'Nationwide internet shutdown ordered by a government (Radar)',
      categories: ['cyber'],
      category_basis: undefined,
      kind: 'data-feed',
      feed: 'radar',
      location_method: 'source',
      sources: [{ name: 'Cloudflare Radar', url: 'https://example.org/radar' }],
    }),
  ];
}

const listed = (page: Page, id: string) => page.locator(`#event-list [data-event-id="${id}"]`);

test('a Cloudflare Radar outage card says where it comes from', async ({ page }) => {
  await openGlobe(page, '/', { events: world() });
  await openEvent(page, 'radar-tl');
  const card = page.locator('#event-card');
  await expect(card.locator('.card-kind')).toContainText('Data feed · Cloudflare Radar');
  await expect(card.locator('.card-snippet')).toHaveText('Made-up description of a test outage.');
  await expect(card).toContainText(
    "Outage seen by Cloudflare Radar in its network traffic. The cause is Radar's assessment.",
  );
  await expect(card).toContainText('Cyber & outages');
});

test('the Cyber & outages filter turns outages off and on', async ({ page }) => {
  await openGlobe(page, '/', { events: world() });
  await expect(listed(page, 'radar-tl')).toHaveCount(1);
  await page.locator('#filter-toggle').click();
  const chip = page.locator('[data-filter=categories] .chip', { hasText: 'Cyber & outages' });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(listed(page, 'radar-tl')).toHaveCount(0);
  await chip.click();
  await expect(listed(page, 'radar-tl')).toHaveCount(1);
});
