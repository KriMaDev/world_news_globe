/** The Geography map's country symbols: one per country, the category of its most severe news,
 * "+N" for its other categories, the full list in its card (rule in docs/severity.md).
 * Made-up events only. */
import { expect, test, type Page } from '@playwright/test';
import { altitude, openGlobe, showEurope, syntheticEvent, watchProblems } from './fixtures';

function geo(country: string, code: string) {
  return {
    continent: 'Europe',
    region: 'Western Europe',
    country,
    country_code: code,
    admin1: null,
    city: null,
    precision: 'country',
  };
}

/** A made-up event in France (or another country) with these categories and severity. */
const inCountry = (
  id: string,
  severity: string,
  categories: string[],
  where: [string, string, number, number] = ['France', 'FR', 48.8, 2.3],
  extra: Record<string, unknown> = {},
) =>
  syntheticEvent(id, where[2], where[3], {
    severity,
    categories,
    category_basis: Object.fromEntries(categories.map((c) => [c, 'headline'])),
    place: where[0],
    geo: geo(where[0], where[1]),
    ...extra,
  });

/** The country's label (named or symbol only), found by its title. `showEurope` opens the
 * event "news-fr", so each test has one. */
const countryLabel = (page: Page, name: string) =>
  page.locator(`.map-label.kind-country[title^="${name}"]`);

test('a country shows the symbol of its most severe news, and "+N" for the rest', async ({
  page,
}) => {
  const problems = watchProblems(page);
  await openGlobe(page, '/?view=geo', {
    events: [
      inCountry('news-fr', 'critical', ['war']),
      inCountry('fr-sport', 'low', ['sport']),
      inCountry('fr-sport-2', 'low', ['sport']),
      inCountry('fr-vote', 'moderate', ['politics']),
    ],
  });
  await showEurope(page);
  const france = countryLabel(page, 'France').first();
  await expect(france).toHaveAttribute('data-symbol', 'war', { timeout: 30_000 });
  await expect(france.locator('.map-label-more')).toHaveText('+2');
  await expect(france).toHaveAttribute(
    'title',
    'France: main news War (critical), 2 more categories · click for more',
  );
  await expect(france.locator('svg.news-icon')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('a tie at the top goes to the first category in the fixed order', async ({ page }) => {
  await openGlobe(page, '/?view=geo', {
    events: [inCountry('news-fr', 'high', ['sport']), inCountry('fr-vote', 'high', ['politics'])],
  });
  await showEurope(page);
  await expect(countryLabel(page, 'France').first()).toHaveAttribute('data-symbol', 'politics', {
    timeout: 30_000,
  });
});

test('a disaster shows its own type, and turning a category off changes the symbol', async ({
  page,
}) => {
  await openGlobe(page, '/?view=geo', {
    events: [
      inCountry('fr-flood', 'high', ['natural-disasters'], undefined, {
        hazard: 'FL',
        kind: 'data-feed',
      }),
      inCountry('news-fr', 'low', ['sport']),
    ],
  });
  await showEurope(page);
  const france = countryLabel(page, 'France').first();
  await expect(france).toHaveAttribute('data-symbol', 'FL', { timeout: 30_000 });
  await expect(france.locator('.map-label-more')).toHaveText('+1');

  await page.locator('#filter-toggle').click();
  await page.locator('[data-filter=categories] .chip', { hasText: 'Natural disasters' }).click();
  await expect(france).toHaveAttribute('data-symbol', 'sport');
  await expect(france.locator('.map-label-more')).toHaveCount(0);
  await expect(france).toHaveAttribute('title', /main news Sport \(low\) · click/);
});

test('a small country shows its symbol alone until its name shows, never over a name', async ({
  page,
}) => {
  await openGlobe(page, '/?view=geo', {
    events: [
      inCountry('news-fr', 'low', ['politics']),
      inCountry('lu-court', 'high', ['crime'], ['Luxembourg', 'LU', 49.6, 6.1]),
    ],
  });
  await showEurope(page);
  // Far enough that Luxembourg's name doesn't show yet (above altitude 1.4).
  for (let i = 0; i < 4 && (await altitude(page)) < 1.5; i++) {
    await page.locator('#zoom-out').click();
    await page.waitForTimeout(700);
  }
  expect(await altitude(page)).toBeGreaterThan(1.4);
  const luxembourg = countryLabel(page, 'Luxembourg');
  await expect(luxembourg.first()).toBeAttached({ timeout: 30_000 });
  await expect(luxembourg.first()).toHaveClass(/is-symbol-only/);
  await expect(luxembourg.first()).toHaveAttribute('data-symbol', 'crime');

  // Wherever a symbol shows alone, it covers no name.
  const overlaps = await page.evaluate(() => {
    const shown = [...document.querySelectorAll<HTMLElement>('.map-label')].filter(
      (e) => !e.matches('.is-hidden, .is-crowded'),
    );
    const boxes = shown.map((e) => ({ e, r: e.getBoundingClientRect() }));
    const alone = boxes.filter(({ e }) => e.matches('.is-symbol-only, .is-compact'));
    const named = boxes.filter(({ e }) => !e.matches('.is-symbol-only, .is-compact'));
    return alone.filter(({ r }) =>
      named.some(
        ({ r: n }) => r.left < n.right && r.right > n.left && r.top < n.bottom && r.bottom > n.top,
      ),
    ).length;
  });
  expect(overlaps).toBe(0);

  // Close up, its name shows with its symbol.
  for (let i = 0; i < 8 && (await altitude(page)) > 0.9; i++) {
    await page.locator('#zoom-in').click();
    await page.waitForTimeout(700);
  }
  const named = page.locator('.map-label.kind-country.has-news:not(.is-symbol-only)', {
    hasText: 'Luxembourg',
  });
  await expect(named).toBeAttached({ timeout: 10_000 });
  await expect(named).toHaveAttribute('data-symbol', 'crime');
});

test("the country's card lists every category in its news, with counts", async ({ page }) => {
  await openGlobe(page, '/?view=geo', {
    events: [
      inCountry('news-fr', 'critical', ['war']),
      inCountry('fr-sport', 'low', ['sport']),
      inCountry('fr-sport-2', 'low', ['sport']),
      inCountry('fr-vote', 'moderate', ['politics']),
    ],
  });
  await showEurope(page);
  const france = countryLabel(page, 'France').first();
  await expect(france).toHaveAttribute('data-symbol', 'war', { timeout: 30_000 });
  await france.evaluate((element) => (element as HTMLElement).click());
  const rows = page.locator('#event-card .place-categories li');
  await expect(rows).toHaveText(['War 1', 'Politics 1', 'Sport 2']);
  await expect(rows.locator('svg')).toHaveCount(3);
});

test('the legend lists the country symbols on the Geography map only', async ({
  page,
  isMobile,
}) => {
  await openGlobe(page, '/?view=geo', { events: [inCountry('fr-vote', 'low', ['politics'])] });
  if (isMobile) await page.locator('.legend-toggle').click();
  const control = page.locator('.legend-country-symbols summary');
  await expect(control).toHaveText('Show country symbols');
  await control.click();
  await expect(control).toHaveText('Hide country symbols');
  const list = page.locator('.legend-country-symbols li');
  await expect(list.filter({ hasText: 'Crime & justice' })).toHaveCount(1);
  await expect(list.filter({ hasText: 'Natural disasters, by type' })).toHaveCount(1);
  await expect(list.filter({ hasText: 'Earthquake' })).toHaveCount(1);

  await page.locator('#view-news').click();
  await expect(page.locator('.legend-country-symbols')).toBeHidden();
});
