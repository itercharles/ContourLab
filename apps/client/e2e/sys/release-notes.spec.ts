/**
 * SYS-016: System shall provide an in-application release notes page displaying version history.
 */

import { test, expect } from '@playwright/test';

test.describe('Release notes page @links:SYS-016', () => {
  test('release notes page renders at least one entry with a version and change summary @links:SYS-016 @testing:T1', async ({ page }) => {
    await page.goto('/release-notes');
    await expect(page.getByRole('heading', { name: 'Release Notes' })).toBeVisible();
    const versionHeadings = page.locator('h2').filter({ hasText: /^v\d/ });
    await expect(versionHeadings.first()).toBeVisible();
    const cards = page.locator('main > div');
    await expect(cards.first().locator('li').first()).toBeVisible();
  });

  test('release notes entries are ordered newest-first @links:SYS-016 @testing:T2', async ({ page }) => {
    await page.goto('/release-notes');
    await expect(page.getByRole('heading', { name: 'Release Notes' })).toBeVisible();
    const headings = page.locator('h2').filter({ hasText: /^v\d/ });
    const count = await headings.count();
    if (count < 2) return;
    const firstText = await headings.nth(0).textContent();
    const secondText = await headings.nth(1).textContent();
    const firstVersion = firstText?.replace(/^v/, '') ?? '';
    const secondVersion = secondText?.replace(/^v/, '') ?? '';
    const toNum = (v: string) => v.split('.').map(Number);
    const [fa, fb, fc] = toNum(firstVersion);
    const [sa, sb, sc] = toNum(secondVersion);
    const firstIsNewer =
      fa > sa || (fa === sa && fb > sb) || (fa === sa && fb === sb && fc >= sc);
    expect(firstIsNewer).toBe(true);
  });
});
