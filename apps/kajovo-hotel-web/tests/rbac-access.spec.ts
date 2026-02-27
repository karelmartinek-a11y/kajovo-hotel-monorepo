import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'maintenance@example.com',
        role: 'maintenance',
        permissions: ['dashboard:read', 'issues:read', 'issues:write', 'reports:read'],
        actor_type: 'portal',
      }),
    });
  });
});

test('restricted module is hidden in navigation and shows access denied on direct URL', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Skladové hospodářství' })).toHaveCount(0);

  await page.goto('/sklad');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
  await expect(page.getByText('Přístup odepřen')).toBeVisible();
  await expect(page.getByText(/(maintenance|nem(a|á)te opr(a|á)vn(ě|e)n(i|í))/i)).toBeVisible();
});
