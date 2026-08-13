import { test, expect } from '@playwright/test';

test.describe('E2E Authentication Flow', () => {
  test('should display login page correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check if redirected or login screen visible
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    
    // If login is shown
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    } else {
      // Already authenticated or redirected to dashboard
      await expect(page).toHaveURL(/.*dashboard/i);
    }
  });

  test('should show error message on invalid credentials', async ({ page }) => {
    await page.goto('/');
    
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill('invalid_user@airline.com');
      await page.locator('input[type="password"]').fill('WrongPassword123!');
      await page.locator('button[type="submit"]').click();
      
      // Toast error or inline message should be visible
      const toastOrAlert = page.locator('[role="status"], .text-red-500, .toast');
      await expect(toastOrAlert.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
