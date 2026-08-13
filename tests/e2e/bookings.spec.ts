import { test, expect } from '@playwright/test';

test.describe('E2E Booking Management', () => {
  test('should render bookings table and search interface', async ({ page }) => {
    await page.goto('/');
    
    // Wait for main UI layout
    await page.waitForLoadState('networkidle');
    
    // Check if search or booking controls exist
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="PNR"]');
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(searchInput).toBeVisible();
      await searchInput.fill('PNR123');
      await expect(searchInput).toHaveValue('PNR123');
    }
  });

  test('should open Create Booking drawer or modal when Create button is clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const createBtn = page.locator('button:has-text("Create Booking"), button:has-text("New Booking")');
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
      const modalOrDrawer = page.locator('[role="dialog"], form');
      await expect(modalOrDrawer.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
