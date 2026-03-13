import { expect, test, type Page, type Route } from '@playwright/test';

type AuthPayload = {
  email: string;
  role: string;
  permissions: string[];
  actor_type: 'admin' | 'portal';
  roles?: string[];
  active_role?: string | null;
  user_id?: string;
};

async function mockAuth(page: Page, payload: AuthPayload): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user_id: payload.user_id ?? payload.email,
        roles: payload.roles ?? [payload.role],
        active_role: payload.active_role ?? payload.role,
        ...payload,
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });
});

test('portal inventory create route stays admin-only for sklad role', async ({ page }) => {
  await mockAuth(page, {
    email: 'sklad@example.com',
    role: 'sklad',
    roles: ['sklad'],
    permissions: ['inventory:read', 'inventory:write'],
    actor_type: 'portal',
  });

  await page.route('**/api/v1/inventory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 42, name: 'Jablečný mošt', unit: 'ks', min_stock: 6, current_stock: 0, amount_per_piece_base: 1 }]),
    });
  });

  await page.goto('/sklad/nova');
  await expect(page.getByText('Přístup odepřen')).toBeVisible();
  await expect(page.getByTestId('inventory-create-page')).toHaveCount(0);
});
