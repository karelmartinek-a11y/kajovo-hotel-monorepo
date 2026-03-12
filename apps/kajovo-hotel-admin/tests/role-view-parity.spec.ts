import { expect, test, type Page, type Route } from '@playwright/test';

const adminPath = (path: string): string => {
  if (path.startsWith('/admin')) {
    return path;
  }
  return `/admin${path.startsWith('/') ? '' : '/'}${path}`;
};

type AuthPayload = {
  email: string;
  role: string;
  permissions: string[];
  actor_type: 'admin' | 'portal';
};

async function mockAuth(page: Page, payload: AuthPayload): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

async function openAdminNavItem(page: Page, label: RegExp): Promise<void> {
  const desktopNav = page.getByTestId('module-navigation-desktop');
  const directLink = desktopNav.getByRole('link', { name: label });
  if (await directLink.count()) {
    await directLink.first().click();
    return;
  }

  const moreButton = desktopNav.getByRole('button', { name: /Dal/i });
  await expect(moreButton).toBeVisible();
  await moreButton.click();
  await desktopNav.getByRole('menuitem', { name: label }).click();
}

test.beforeEach(async ({ page }) => {
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
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
  });

  const serviceDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  await page.route('**/api/v1/breakfast?*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          service_date: serviceDate,
          room_number: '101',
          guest_name: 'Novák',
          guest_count: 2,
          status: 'pending',
          note: null,
        },
      ]),
    })
  );
  await page.route('**/api/v1/breakfast/daily-summary?*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        service_date: serviceDate,
        total_orders: 1,
        total_guests: 2,
        status_counts: { pending: 1, preparing: 0, served: 0, cancelled: 0 },
      }),
    })
  );
});

test('role view dropdown sits in header and keeps admin modules visible', async ({ page }) => {
  await page.goto(adminPath('/'));

  const headerSelect = page.getByLabel('Role pohledu');
  await expect(headerSelect).toBeVisible();
  await openAdminNavItem(page, /Uživatelé/i);
  await expect(page).toHaveURL(/\/admin\/uzivatele$/);
  await page.goto(adminPath('/'));
  await openAdminNavItem(page, /Nastavení/i);
  await expect(page).toHaveURL(/\/admin\/nastaveni$/);
  await page.goto(adminPath('/'));
  await openAdminNavItem(page, /Profil/i);
  await expect(page).toHaveURL(/\/admin\/profil$/);
});

test('housekeeping role view opens the same operational housekeeping intake instead of placeholder', async ({ page }) => {
  await page.goto(adminPath('/'));

  await page.getByLabel('Role pohledu').selectOption('pokojská');
  await expect(page).toHaveURL(/\/admin\/pokojska$/);

  await expect(page.getByTestId('housekeeping-admin-page')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zadání závady' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zadání nálezu' })).toBeVisible();
  await expect(page.locator('#housekeeping_room')).toBeVisible();
  await openAdminNavItem(page, /Uživatelé/i);
  await expect(page).toHaveURL(/\/admin\/uzivatele$/);
});

test('breakfast role view keeps breakfast workflow but hides recepce-only import controls', async ({ page }) => {
  await page.goto(adminPath('/'));

  await page.getByLabel('Role pohledu').selectOption('snídaně');
  await page.getByRole('link', { name: /^Snídaně$/i }).click();

  await expect(page).toHaveURL(/\/admin\/snidane$/);
  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
  await expect(page.getByLabel('Import PDF')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Uživatelé' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Uživatelé/i })).toBeVisible();
});
