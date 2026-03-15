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

type BreakfastItem = {
  id: number;
  service_date: string;
  room_number: string;
  guest_name: string | null;
  guest_count: number;
  status: 'pending' | 'served';
  note: string | null;
  diet_no_gluten?: boolean;
  diet_no_milk?: boolean;
  diet_no_pork?: boolean;
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

test('breakfast role sees only the serving list and can mark served', async ({ page }) => {
  await mockAuth(page, {
    email: 'snidane@example.com',
    role: 'snidane',
    roles: ['snidane'],
    permissions: ['breakfast:read', 'breakfast:write'],
    actor_type: 'portal',
  });

  let items: BreakfastItem[] = [
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
  ];

  await page.route('**/api/v1/breakfast/daily-summary?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        service_date: '2026-03-13',
        total_orders: items.length,
        total_guests: 2,
        status_counts: {
          pending: items.filter((item) => item.status === 'pending').length,
          preparing: 0,
          served: items.filter((item) => item.status === 'served').length,
          cancelled: 0,
        },
      }),
    });
  });
  await page.route('**/api/v1/breakfast?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items) });
  });
  await page.route('**/api/v1/breakfast/11', async (route) => {
    const payload = route.request().postDataJSON() as { status: 'pending' | 'served' };
    items = items.map((item) => (item.id === 11 ? { ...item, status: payload.status } : item));
    const updated = items.find((item) => item.id === 11);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
  });

  await page.goto('/snidane');
  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
  await expect(page.getByLabel('Datum')).toBeVisible();
  await expect(page.getByLabel('Hledat')).toHaveCount(0);
  await expect(page.getByLabel('Import PDF')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Vr.tit cel. den/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Smazat den' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Pokoj' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Osoby' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Jm/i })).toBeVisible();
  await expect(page.getByText('Nulovy pokoj')).toHaveCount(0);
  await expect(page.locator('tbody tr').nth(0)).toContainText('204');
  await expect(page.locator('tbody tr').nth(1)).toContainText('305');
  await expect(page.getByRole('button', { name: /Vyd/i })).toHaveCount(2);
  await page.getByRole('button', { name: /Vyd/i }).first().click();
  await expect(page.getByText('Pavel Novak')).toBeVisible();
  await expect(page.locator('tbody tr').nth(0)).toContainText('Vydáno');

  await page.goto('/snidane/nova');
  await expect(page.getByText(/odep/i)).toBeVisible();
});

test('recepce can manage breakfast day including revert and day delete controls', async ({ page }) => {
  await mockAuth(page, {
    email: 'recepce@example.com',
    role: 'recepce',
    roles: ['recepce'],
    permissions: ['breakfast:read', 'breakfast:write'],
    actor_type: 'portal',
  });

  const items: BreakfastItem[] = [
    {
      id: 12,
      service_date: '2026-03-13',
      room_number: '305',
      guest_name: 'Jana Novakova',
      guest_count: 1,
      status: 'served',
      note: null,
      diet_no_gluten: true,
      diet_no_milk: false,
      diet_no_pork: false,
    },
  ];

  await page.route('**/api/v1/breakfast/daily-summary?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        service_date: '2026-03-13',
        total_orders: 1,
        total_guests: 1,
        status_counts: { pending: 0, preparing: 0, served: 1, cancelled: 0 },
      }),
    });
  });
  await page.route('**/api/v1/breakfast?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items) });
  });

  await page.goto('/snidane');
  await expect(page.getByLabel('Hledat')).toBeVisible();
  await expect(page.getByLabel('Import PDF')).toBeVisible();
  await expect(page.getByRole('button', { name: /Vr.tit cel. den/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Smazat den' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Vr.tit$/i })).toBeVisible();
  await expect(page.getByLabel('Bez lepku')).toBeVisible();
});
