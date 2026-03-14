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
        email: 'admin@kajovohotel.local',
        role: 'admin',
        permissions: ['dashboard:read', 'inventory:read', 'inventory:write'],
        actor_type: 'admin',
      }),
    });
  });
}

test('inventory workbench shows cards and creates a stock card', async ({ page }) => {
  let postedCard: Record<string, unknown> | null = null;
  let cards = [] as Array<Record<string, unknown>>;
  await mockAuth(page);

  await page.route('**/api/v1/inventory**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: 'Mouka', unit: 'g', min_stock: 500, current_stock: 3000, supplier: 'Dodavatel', amount_per_piece_base: 1000, pictogram_path: null, pictogram_thumb_path: null, created_at: null, updated_at: null },
      ]),
    });
  });
  await page.route('**/api/v1/inventory/cards', async (route) => {
    if (route.request().method() === 'POST') {
      postedCard = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      cards = [
        {
          id: 10,
          card_type: 'out',
          number: 'VY-2026-0001',
          card_date: '2026-03-11',
          supplier: null,
          reference: 'VY-1',
          note: 'Test karta',
          created_at: null,
          updated_at: null,
          items: [],
        },
      ];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(cards[0]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cards) });
  });
  await page.route('**/api/v1/inventory/movements', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto(adminPath('/sklad'));

  await expect(page.getByRole('heading', { name: 'Ingredience' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Skladové karty' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pohyby' })).toBeVisible();

  await page.locator('#inventory_card_type').selectOption('out');
  await page.locator('#inventory_card_reference').fill('VY-1');
  await page.locator('#inventory_card_note').fill('Test karta');
  await page.locator('#inventory_card_quantity_base_0').fill('500');
  await page.locator('#inventory_card_quantity_pieces_0').fill('1');
  await page.getByRole('button', { name: 'Uložit kartu' }).click();

  expect(postedCard).not.toBeNull();
  await expect(page.getByText('Skladová karta byla uložena.')).toBeVisible();
  await expect(page.getByText('VY-2026-0001')).toBeVisible();
});
