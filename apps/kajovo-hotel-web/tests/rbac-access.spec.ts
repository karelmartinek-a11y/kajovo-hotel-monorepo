import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __KAJOVO_TEST_AUTH__?: unknown }).__KAJOVO_TEST_AUTH__ = {
      userId: 'maint-4',
      role: 'maintenance',
    };
  });
});

test('restricted module is hidden in navigation and shows access denied on direct URL', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Skladové hospodářství' })).toHaveCount(0);

  await page.goto('/sklad');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
  await expect(page.getByText('Přístup odepřen')).toBeVisible();
  await expect(page.getByText(/Role maintenance/)).toBeVisible();
});
