/** The legend's fold on wider screens (phones: mobile.spec.ts). Made-up events only. */
import { expect, test } from '@playwright/test';
import { box, openGlobe } from './fixtures';

test('on a wide screen the legend starts open and folds to the severity levels', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Phones fold the legend to one row: mobile.spec.ts');
  await openGlobe(page);
  const toggle = page.locator('.legend-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.legend-more')).toBeVisible();
  const open = await box(page, '#legend');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.legend-more')).toBeHidden();
  await expect(page.locator('.legend-head')).toContainText('Critical');
  await expect(page.locator('.legend-how').first()).toBeHidden();
  const folded = await box(page, '#legend');
  expect(folded.height).toBeLessThan(open.height / 2);

  // The arrow sits in the top right corner.
  const arrow = await box(page, '.legend-toggle');
  expect(arrow.x + arrow.width).toBeGreaterThan(folded.x + folded.width - 40);
  expect(arrow.y).toBeLessThan(folded.y + 30);

  await page.reload();
  await expect(page.locator('.legend-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('.legend-toggle').click();
  await expect(page.locator('.legend-more')).toBeVisible();
});
