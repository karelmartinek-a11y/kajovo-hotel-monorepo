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

  await page.goto('/admin/');
  await page.getByLabel('Role pohledu').selectOption({ index: 4 });
  await page.goto('/admin/snidane');
  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
  await expect(page.getByLabel('Datum')).toBeVisible();
  await expect(page.getByLabel('Hledat')).toHaveCount(0);
  await expect(page.getByLabel('Import PDF')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Vr.tit cel. den/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Smazat den' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Vyd/i })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Pokoj' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Osoby' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Jm/i })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Diety' })).toBeVisible();
  await expect(page.getByText('204')).toBeVisible();
  await expect(page.getByText('Pavel Novak')).toBeVisible();

  await page.goto('/admin/snidane/nova');
  await expect(page.getByText(/odep/i)).toBeVisible();
});
