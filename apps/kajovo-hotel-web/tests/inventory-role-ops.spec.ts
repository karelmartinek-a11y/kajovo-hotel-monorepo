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

test('sklad role gets movement form without stock visibility or item creation', async ({ page }) => {
  await mockAuth(page, {
    email: 'sklad@example.com',
    role: 'sklad',
    roles: ['sklad'],
    permissions: ['inventory:read', 'inventory:write'],
    actor_type: 'portal',
  });

  await page.route('**/api/v1/inventory**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 5, name: 'Káva', unit: 'kg', min_stock: 3, current_stock: 10, amount_per_piece_base: 1 }]),
      });
      return;
    }
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/v1/inventory/5/movements', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 5,
        name: 'Káva',
        unit: 'kg',
        min_stock: 3,
        current_stock: 8,
        amount_per_piece_base: 1,
        movements: [{ id: 21, item_id: 5, movement_type: 'out', quantity: 2, document_number: 'VY-2026-0001', document_reference: 'DL-1', document_date: '2026-03-13', note: null, created_at: '2026-03-13T08:00:00Z' }],
      }),
    });
  });

  await page.goto('/sklad');
  await expect(page.getByRole('heading', { name: /Nov.*pohyb/i })).toBeVisible();
  await expect(page.getByLabel('Druh pohybu')).toBeVisible();
  await expect(page.getByLabel(/Polo/i)).toBeVisible();
  await expect(page.getByLabel(/Mno/i)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Skladem' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Nov.*polo/i })).toHaveCount(0);
  await expect(page.getByText(/Pohyb vytvo/i)).toBeVisible();
  await page.locator('#inventory_movement_reference').fill('DL-1');
  await page.getByRole('button', { name: 'Potvrdit pohyb' }).click();
  await expect(page.getByText(/VY-2026-0001/)).toBeVisible();

  await page.goto('/sklad/5');
  await expect(page.getByText(/odep/i)).toBeVisible();
});
