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
        permissions: [
          'dashboard:read',
          'housekeeping:read',
          'breakfast:read',
          'breakfast:write',
          'lost_found:read',
          'lost_found:write',
          'issues:read',
          'issues:write',
          'inventory:read',
          'inventory:write',
          'reports:read',
          'reports:write',
          'users:read',
          'settings:read',
        ],
        actor_type: 'admin',
      }),
    });
  });
}

test('admin breakfast role view mirrors the simple serving screen', async ({ page }) => {
  await mockAuth(page);
  await page.route('**/api/v1/breakfast?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 10,
          service_date: '2026-03-13',
          room_number: '305',
          guest_name: 'Pozdejsi pokoj',
          guest_count: 1,
          status: 'pending',
          note: null,
          diet_no_gluten: false,
          diet_no_milk: false,
          diet_no_pork: false,
        },
        {
          id: 11,
          service_date: '2026-03-13',
          room_number: '204',
          guest_name: 'Pavel Novak',
          guest_count: 2,
          status: 'pending',
          note: null,
          diet_no_gluten: false,
          diet_no_milk: true,
          diet_no_pork: false,
        },
        {
          id: 12,
          service_date: '2026-03-13',
          room_number: '099',
          guest_name: 'Nulovy pokoj',
          guest_count: 0,
          status: 'pending',
          note: null,
          diet_no_gluten: false,
          diet_no_milk: false,
          diet_no_pork: false,
        },
      ]),
    });
  });
  await page.route('**/api/v1/breakfast/daily-summary?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        service_date: '2026-03-13',
        total_orders: 1,
        total_guests: 2,
        status_counts: { pending: 1, preparing: 0, served: 0, cancelled: 0 },
      }),
    });
  });

  await page.goto('/admin/snidane');
  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
  await expect(page.getByLabel('Datum')).toBeVisible();
  await expect(page.getByLabel('Hledat')).toBeVisible();
  await expect(page.getByLabel('Import PDF')).toBeVisible();
  await expect(page.getByRole('button', { name: /Vr.tit cel. den/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Smazat den' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Vyd/i })).toHaveCount(2);
  await expect(page.getByRole('columnheader', { name: 'Datum' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Pokoj' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Host' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Počet' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Diety' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Stav' })).toBeVisible();
  await expect(page.getByText('204')).toBeVisible();
  await expect(page.getByText('Pavel Novak')).toBeVisible();
  await expect(page.getByText('Nulovy pokoj')).toHaveCount(0);
  await expect(page.locator('tbody tr').nth(0)).toContainText('204');
  await expect(page.locator('tbody tr').nth(1)).toContainText('305');

  await page.goto('/admin/snidane/nova');
  await expect(page.getByRole('heading', { name: /Nová snídaně/i })).toBeVisible();
});
