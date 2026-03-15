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

async function mockAuth(page: Page, status: number, payload: Record<string, unknown>): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

async function mockPortalAuth(page: Page, payload: AuthPayload): Promise<void> {
  await mockAuth(page, 200, {
    user_id: payload.user_id ?? payload.email,
    roles: payload.roles ?? [payload.role],
    active_role: payload.active_role ?? payload.role,
    ...payload,
  });
}

test('bez session jde portal na login a neotevre modul', async ({ page }) => {
  await mockAuth(page, 401, { detail: 'Not authenticated' });

  await page.goto('/snidane', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('portal-login-page')).toBeVisible();
});

test('recepce vidi jen povolene moduly a prime otevreni skladu skonci access denied', async ({ page }) => {
  await mockPortalAuth(page, {
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
    await phoneNav.getByRole('button', { name: /menu/i }).click();
    await expect(phoneNav.getByRole('menuitem', { name: /snídaně/i })).toBeVisible();
    await expect(phoneNav.getByRole('menuitem', { name: /ztráty a nálezy/i })).toBeVisible();
    await expect(phoneNav.getByRole('menuitem', { name: /skladové hospodářství/i })).toHaveCount(0);
  } else {
    await expect(page.getByRole('link', { name: /snídaně/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /ztráty a nálezy/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /skladové hospodářství/i })).toHaveCount(0);
  }

  await page.goto('/sklad');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
  await expect(page.getByText('Přístup odepřen')).toBeVisible();
});

test('web admin surface je retired page i pro admin session', async ({ page }) => {
  await mockPortalAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['users:read', 'users:write', 'admin:read', 'admin:write'],
    actor_type: 'admin',
  });

  await page.goto('/admin/uzivatele');

  await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Otevrit admin aplikaci' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Portal login' })).toBeVisible();
});
