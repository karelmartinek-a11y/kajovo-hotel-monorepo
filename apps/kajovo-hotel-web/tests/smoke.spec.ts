import { expect, test, type Page, type Route } from '@playwright/test';

async function mockAuth(page: Page, status: number, payload: Record<string, unknown>): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

test.describe('web admin retirement smoke', () => {
  test('admin login path shows deprecation gateway instead of embedded login form', async ({ page }) => {
    await mockAuth(page, 401, { detail: 'Not authenticated' });

    await page.goto('/admin/login');

    await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
    await expect(page.getByTestId('admin-login-page')).toHaveCount(0);
  });

  test('authenticated admin hitting web root is redirected away from portal runtime', async ({ page }) => {
    await mockAuth(page, 200, {
      email: 'admin@kajovohotel.local',
      role: 'admin',
      permissions: ['users:read', 'users:write'],
      actor_type: 'admin',
    });

    await page.goto('/');

    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
  });
});
