import { expect, test, type Page, type Route } from '@playwright/test';

async function mockAuth(page: Page): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'admin@example.com',
        role: 'admin',
        roles: ['admin'],
        active_role: 'admin',
        permissions: ['inventory:read', 'inventory:write', 'users:read', 'settings:read', 'dashboard:read'],
        actor_type: 'admin',
      }),
    });
  });
}

test('admin sees stock values and item management in inventory', async ({ page }) => {
  await mockAuth(page);
  await page.route('**/api/v1/inventory**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 5, name: 'Káva', unit: 'kg', min_stock: 3, current_stock: 10, amount_per_piece_base: 1 }]),
    });
  });

  await page.goto('/admin/sklad');
  await expect(page.getByRole('link', { name: /Nov.*polo/i })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Skladem' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Minimum' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Detail' })).toBeVisible();
});
