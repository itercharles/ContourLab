/**
 * CRS-013: Users shall be able to view software version and release change history.
 */

import { test, expect } from '@playwright/test';

test.describe('Release notes access @links:CRS-013', () => {
  test('user can access the release notes page and see at least one versioned entry with change summary @links:CRS-013 @testing:T1', async ({
    page,
  }) => {
    await page.goto('/release-notes');
    await expect(page.getByRole('heading', { name: 'Release Notes' })).toBeVisible();
    const versionHeadings = page.locator('h2').filter({ hasText: /^v\d/ });
    await expect(versionHeadings.first()).toBeVisible();
    const cards = page.locator('main > div');
    await expect(cards.first().locator('li').first()).toBeVisible();
  });
});
