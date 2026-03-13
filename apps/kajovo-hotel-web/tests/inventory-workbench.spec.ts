import { expect, test, type Page, type Route } from '@playwright/test';

async function mockAuth(page: Page): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'sklad@example.com',
        role: 'sklad',
        permissions: ['inventory:read', 'inventory:write'],
        actor_type: 'portal',
      }),
    });
  });
}

test('portal inventory workbench shows cards and creates a stock card', async ({ page }) => {
  let postedCard: Record<string, unknown> | null = null;
  let cards = [] as Array<Record<string, unknown>>;
  await mockAuth(page);

  await page.route('**/api/v1/inventory**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: 'Caj', unit: 'ks', min_stock: 10, current_stock: 50, supplier: null, amount_per_piece_base: 1, pictogram_path: null, pictogram_thumb_path: null, created_at: null, updated_at: null },
      ]),
    });
  });
  await page.route('**/api/v1/inventory/cards', async (route) => {
    if (route.request().method() === 'POST') {
      postedCard = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      cards = [
        {
          id: 11,
          card_type: 'in',
          number: 'PR-2026-0001',
          card_date: '2026-03-11',
          supplier: 'Dodavatel',
          reference: 'DL-1',
          note: 'Doplneni skladu',
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

  await page.goto('/sklad');

  await expect(page.getByRole('heading', { name: 'Ingredience' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Skladové karty' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pohyby' })).toBeVisible();

  await page.locator('#inventory_card_type').selectOption('in');
  await page.locator('#inventory_card_supplier').fill('Dodavatel');
  await page.locator('#inventory_card_reference').fill('DL-1');
  await page.locator('#inventory_card_note').fill('Doplneni skladu');
  await page.locator('#inventory_card_quantity_base_0').fill('25');
  await page.locator('#inventory_card_quantity_pieces_0').fill('25');
  await page.getByRole('button', { name: 'Uložit kartu' }).click();

  expect(postedCard).not.toBeNull();
  await expect(page.getByText('Skladová karta byla uložena.')).toBeVisible();
  await expect(page.getByText('PR-2026-0001')).toBeVisible();
});
