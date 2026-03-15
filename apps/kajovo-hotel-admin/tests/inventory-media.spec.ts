import { expect, test, type Page, type Route } from '@playwright/test';

const adminPath = (path: string): string => {
  if (path.startsWith('/admin')) {
    return path;
  }
  return `/admin${path.startsWith('/') ? '' : '/'}${path}`;
};

async function mockAuth(page: Page): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'admin@example.com',
        role: 'admin',
        permissions: ['inventory:read', 'inventory:write'],
        actor_type: 'admin',
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });
});

test('admin inventory create flow uploads thumbnail and hides supplier field', async ({ page }) => {
  await mockAuth(page);

  let inventoryItem = {
    id: 61,
    name: 'Jablečný mošt',
    unit: 'ks',
    min_stock: 6,
    current_stock: 0,
    amount_per_piece_base: 1,
    pictogram_path: null as string | null,
    pictogram_thumb_path: null as string | null,
    movements: [] as Array<Record<string, unknown>>,
    audit_logs: [] as Array<Record<string, unknown>>,
  };
  let pictogramUploaded = false;

  await page.route('**/api/v1/inventory', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([inventoryItem]) });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      inventoryItem = { ...inventoryItem, ...payload, id: 61, movements: [], audit_logs: [] };
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/v1/inventory/*/pictogram', async (route) => {
    pictogramUploaded = true;
    inventoryItem = {
      ...inventoryItem,
      pictogram_path: '/media/inventory/original/inventory-61.png',
      pictogram_thumb_path: '/media/inventory/thumb/inventory-61.webp',
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
  });
  await page.route('**/api/v1/inventory/*/pictogram/thumb', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', path: 'tests/fixtures/inventory-thumb.png' });
  });
  await page.route('**/api/v1/inventory/*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
  });

  await page.goto(adminPath('/sklad/nova'));
  await expect(page.getByTestId('inventory-create-page')).toBeVisible();
  await expect(page.getByText(/dodavatel/i)).toHaveCount(0);

  await page.getByLabel(/^název$/i).fill('Jablečný mošt');
  await page.getByLabel(/hodnota veličiny v 1 ks/i).fill('1');
  await page.getByLabel(/minimální stav/i).fill('6');
  await page.setInputFiles('#inventory_pictogram', 'tests/fixtures/inventory-thumb.png');

  await page.getByRole('button', { name: /uložit/i }).click();
  await expect.poll(() => pictogramUploaded).toBeTruthy();
  await expect(page).toHaveURL(/\/admin\/sklad\/61$/);
  await expect(page.getByTestId('inventory-detail-page')).toContainText('Jablečný mošt');
  await expect(page.getByRole('img', { name: /miniatura položky jablečný mošt/i })).toBeVisible();
  await expect(page.getByText(/dodavatel/i)).toHaveCount(0);
});

test('admin inventory create flow blocks invalid amount before submit', async ({ page }) => {
  await mockAuth(page);

  let createRequests = 0;

  await page.route('**/api/v1/inventory', async (route) => {
    if (route.request().method() === 'POST') {
      createRequests += 1;
      await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ detail: 'should not submit' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto(adminPath('/sklad/nova'));
  await expect(page.getByTestId('inventory-create-page')).toBeVisible();

  await page.getByLabel(/^název$/i).fill('Test položka');
  await page.getByLabel(/hodnota veličiny v 1 ks/i).fill('0');
  await page.getByRole('button', { name: /uložit/i }).click();

  await expect(page.getByText('Hodnota veličiny v 1 ks musí být alespoň 1.')).toBeVisible();
  await expect.poll(() => createRequests).toBe(0);
});
