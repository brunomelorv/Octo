import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  // Update this depending on what title the app has.
  await expect(page).toHaveTitle(/Portal do Frank/);
});

test('can navigate to home page', async ({ page }) => {
  await page.goto('/');
  // Add some simple assertions for your application
  await expect(page.locator('body')).toBeVisible();
});
