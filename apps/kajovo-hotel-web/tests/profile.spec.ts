import { expect, test, type Page, type Route } from '@playwright/test';

type ProfilePayload = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  note: string | null;
  roles: string[];
  actor_type: 'admin' | 'portal';
};

test('portal self-service profile supports update and password change', async ({ page }) => {
  await page.addInitScript(() => {
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });

  let loggedOut = false;
  let profile: ProfilePayload = {
    email: 'recepce@example.com',
    first_name: 'Recepce',
    last_name: 'User',
    phone: '+420111222333',
    note: 'Puvodni poznamka',
    roles: ['recepce'],
    actor_type: 'portal',
  };
  let patchPayload: Record<string, unknown> | null = null;
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
        email: profile.email,
        role: 'recepce',
        roles: ['recepce'],
        active_role: 'recepce',
        permissions: ['dashboard:read', 'reports:read'],
        actor_type: 'portal',
      }),
    });
  });

  await page.route('**/api/auth/profile', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profile),
      });
      return;
    }
    if (route.request().method() === 'PATCH') {
      patchPayload = route.request().postDataJSON() as Record<string, unknown>;
      profile = {
        ...profile,
        first_name: String(patchPayload.first_name),
        last_name: String(patchPayload.last_name),
        phone: patchPayload.phone === null ? null : String(patchPayload.phone),
        note: patchPayload.note === null ? null : String(patchPayload.note),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profile),
      });
      return;
    }
    await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/auth/change-password', async (route: Route) => {
    passwordPayload = route.request().postDataJSON() as Record<string, unknown>;
    loggedOut = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/profil');

  await expect(page.getByTestId('portal-profile-page')).toBeVisible();
  await page.locator('#portal_profile_first_name').fill('Nova');
  await page.locator('#portal_profile_note').fill('Aktualizovano');
  await page.getByRole('button', { name: 'Ulozit profil' }).click();

  expect(patchPayload).toMatchObject({
    first_name: 'Nova',
    last_name: 'User',
    phone: '+420111222333',
    note: 'Aktualizovano',
  });
  await expect(page.getByText('Profil byl ulozen.')).toBeVisible();

  await page.locator('#portal_profile_current_password').fill('OldPass123');
  await page.locator('#portal_profile_new_password').fill('NewPass456');
  await page.getByRole('button', { name: 'Zmenit heslo' }).click();

  expect(passwordPayload).toEqual({
    old_password: 'OldPass123',
    new_password: 'NewPass456',
  });
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('portal-login-page')).toBeVisible();
});
