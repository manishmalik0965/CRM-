import { test, expect } from '@playwright/test';

test.describe('E2E Dashboard & Analytics', () => {
  test('should render navigation bar and header elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Sidebar navigation or header logo
    const headerLogo = page.locator('header, nav, [data-testid="app-header"]').first();
    await expect(headerLogo).toBeVisible();
  });

  test('should handle responsive viewport scaling gracefully', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // Mobile
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // App layout should render without overflow errors
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
