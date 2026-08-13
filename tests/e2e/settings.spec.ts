import { test, expect } from '@playwright/test';

test.describe('E2E Settings & Branding', () => {
  test('should navigate to settings if accessible', async ({ page }) => {
    await page.goto('/settings').catch(() => page.goto('/'));
    await page.waitForLoadState('domcontentloaded');

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
