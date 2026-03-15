import { expect, test, type Route } from '@playwright/test';

const adminPath = (path: string): string => {
  if (path.startsWith('/admin')) {
    return path;
  }
  return `/admin${path.startsWith('/') ? '' : '/'}${path}`;
};

test('admin profil pouziva self-service endpoint a umi ulozit zmenu i heslo', async ({ page }) => {
  await page.addInitScript(() => {
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });

  let loggedOut = false;
  let savedDisplayName: string | null = null;
  let passwordPayload: Record<string, unknown> | null = null;

  await page.route('**/api/auth/me', async (route: Route) => {
    if (loggedOut) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Authentication required' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'admin@example.com',
        role: 'admin',
        roles: ['admin'],
        active_role: 'admin',
        permissions: ['dashboard:read', 'users:read', 'settings:read'],
        actor_type: 'admin',
      }),
    });
  });

  await page.route('**/api/v1/admin/profile', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          email: 'admin@example.com',
          display_name: savedDisplayName ?? 'Hlavní služba',
          password_changed_at: '2026-03-10T09:00:00Z',
          updated_at: '2026-03-11T12:00:00Z',
        }),
      });
      return;
    }

    const payload = route.request().postDataJSON() as { display_name: string };
    savedDisplayName = payload.display_name;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'admin@example.com',
        display_name: savedDisplayName,
        password_changed_at: '2026-03-10T09:00:00Z',
        updated_at: '2026-03-12T15:00:00Z',
      }),
    });
  });

  await page.route('**/api/v1/admin/profile/password', async (route: Route) => {
    passwordPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/api/auth/admin/logout', async (route: Route) => {
    loggedOut = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto(adminPath('/profil'));

  await expect(page.getByTestId('admin-profile-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profil administrátora' })).toBeVisible();
  await expect(page.getByLabel('Jméno profilu')).toHaveValue('Hlavní služba');

  await page.getByLabel('Jméno profilu').fill('Noční směna');
  await page.getByRole('button', { name: 'Uložit profil' }).click();

  expect(savedDisplayName).toBe('Noční směna');
  await expect(page.getByText('Profil byl uložen.')).toBeVisible();

  await page.getByLabel('Aktuální heslo').fill('AdminOld123');
  await page.getByLabel('Nové heslo').fill('AdminNew456');
  await page.getByLabel('Potvrzení nového hesla').fill('AdminNew456');
  await page.getByRole('button', { name: 'Změnit heslo' }).click();

  expect(passwordPayload).toEqual({
    old_password: 'AdminOld123',
    new_password: 'AdminNew456',
  });
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByTestId('admin-login-page')).toBeVisible();
});
