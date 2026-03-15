import { expect, test, type Page, type Route } from '@playwright/test';

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

test('restricted module is hidden in navigation and shows access denied on direct URL', async ({ page }) => {
  await mockAuth(page, {
    email: 'udrzba@example.com',
    role: 'údržba',
    permissions: ['issues:read', 'issues:write'],
    actor_type: 'portal',
  });
  await page.route('**/api/v1/issues**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Skladové hospodářství' })).toHaveCount(0);

  await page.goto('/sklad');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
  await expect(page.getByText('Přístup odepřen')).toBeVisible();
  await expect(page.getByText(/Role\s+údržba/i)).toBeVisible();
});

test('recepce navigace obsahuje jen snídaně a nálezy', async ({ page }) => {
  await mockAuth(page, {
    email: 'recepce@example.com',
    role: 'recepce',
    permissions: ['breakfast:read', 'lost_found:read'],
    actor_type: 'portal',
  });
  await page.route('**/api/v1/lost-found**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  const viewport = page.viewportSize();
  const isPhone = (viewport?.width ?? 0) <= 767;

  if (isPhone) {
    const phoneNav = page.getByTestId('module-navigation-phone');
    await phoneNav.getByRole('button', { name: 'Menu' }).click();
    await expect(phoneNav.getByRole('menuitem', { name: 'Snídaně' })).toBeVisible();
    await expect(phoneNav.getByRole('menuitem', { name: 'Ztráty a nálezy' })).toBeVisible();
    await expect(phoneNav.getByRole('menuitem', { name: 'Závady' })).toHaveCount(0);
    await expect(phoneNav.getByRole('menuitem', { name: 'Skladové hospodářství' })).toHaveCount(0);
  } else {
    await expect(page.getByRole('link', { name: 'Snídaně' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ztráty a nálezy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Závady' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Skladové hospodářství' })).toHaveCount(0);
  }
});

test('recepce deep link do zakázaných modulů zůstává odepřený', async ({ page }) => {
  await mockAuth(page, {
    email: 'recepce@example.com',
    role: 'recepce',
    permissions: ['breakfast:read', 'lost_found:read'],
    actor_type: 'portal',
  });

  await page.goto('/hlaseni');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();

  await page.goto('/zavady');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();

  await page.goto('/sklad');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
});

test('web admin surface neobsahuje embedded modulovou navigaci', async ({ page }) => {
  await page.goto('/admin/uzivatele');

  await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
  await expect(page.getByTestId('module-navigation-desktop')).toHaveCount(0);
  await expect(page.getByTestId('module-navigation-phone')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Otevrit admin aplikaci' })).toBeVisible();
});
