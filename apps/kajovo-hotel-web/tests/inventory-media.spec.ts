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

test('portal inventory create flow uploads thumbnail and hides supplier field', async ({ page }) => {
  await mockAuth(page, {
    email: 'sklad@example.com',
    role: 'sklad',
    roles: ['sklad'],
    permissions: ['inventory:read', 'inventory:write'],
    actor_type: 'portal',
  });

  let inventoryItem = {
    id: 42,
    name: 'Jablečný mošt',
    unit: 'ks',
    min_stock: 6,
    current_stock: 0,
    amount_per_piece_base: 1,
    pictogram_path: null as string | null,
    pictogram_thumb_path: null as string | null,
    movements: [] as Array<Record<string, unknown>>,
  };
  let pictogramUploaded = false;

  await page.route('**/api/v1/inventory', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([inventoryItem]) });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      inventoryItem = { ...inventoryItem, ...payload, id: 42, movements: [] };
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/v1/inventory/*/pictogram', async (route) => {
    pictogramUploaded = true;
    inventoryItem = {
      ...inventoryItem,
      pictogram_path: '/media/inventory/original/inventory-42.png',
      pictogram_thumb_path: '/media/inventory/thumb/inventory-42.webp',
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
  });
  await page.route('**/api/v1/inventory/*/pictogram/thumb', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', path: 'tests/fixtures/inventory-thumb.png' });
  });
  await page.route('**/api/v1/inventory/*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
  });

  await page.goto('/sklad/nova');
  await expect(page.getByTestId('inventory-create-page')).toBeVisible();
  await expect(page.getByText(/dodavatel/i)).toHaveCount(0);

  await page.getByLabel(/^název$/i).fill('Jablečný mošt');
  await page.getByLabel(/hodnota veličiny v 1 ks/i).fill('1');
  await page.getByLabel(/minimální stav/i).fill('6');
  await page.setInputFiles('#inventory_pictogram', 'tests/fixtures/inventory-thumb.png');

  await page.getByRole('button', { name: /uložit/i }).click();
  await expect.poll(() => pictogramUploaded).toBeTruthy();
  await expect(page).toHaveURL(/\/sklad\/42$/);
  await expect(page.getByTestId('inventory-detail-page')).toContainText('Jablečný mošt');
  await expect(page.getByRole('img', { name: /miniatura položky jablečný mošt/i })).toBeVisible();
  await expect(page.getByText(/dodavatel/i)).toHaveCount(0);
});
