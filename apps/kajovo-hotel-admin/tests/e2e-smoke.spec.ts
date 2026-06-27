import { expect, test, type APIRequestContext } from '@playwright/test';
import { getAdminCredentials } from '../test-admin-credentials';

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = getAdminCredentials();

async function csrfHeaderFor(context: APIRequestContext) {
  const state = await context.storageState();
  const csrf = state.cookies.find((cookie: { name: string; value: string }) => cookie.name === 'kajovo_csrf')?.value;
  expect(csrf, 'Expected CSRF cookie after login').toBeTruthy();
  return { 'x-csrf-token': csrf! };
}

test.describe('CI smoke auth flows', () => {
  test('admin login + hint email + user create + portal login', async ({ request }) => {
    const adminLoginResponse = await request.post('/api/auth/admin/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(adminLoginResponse.ok()).toBeTruthy();
    await expect(adminLoginResponse.json()).resolves.toMatchObject({
      email: ADMIN_EMAIL,
      actor_type: 'admin',
      role: 'admin',
    });

    const csrfHeaders = await csrfHeaderFor(request);

    const hintResponse = await request.post('/api/auth/admin/hint', {
      data: { email: ADMIN_EMAIL },
      headers: csrfHeaders,
    });
    expect(hintResponse.ok()).toBeTruthy();
    const hintBody = await hintResponse.json();
    expect(hintBody.ok).toBeTruthy();
    expect(typeof hintBody.connected).toBe('boolean');
    expect(typeof hintBody.send_attempted).toBe('boolean');

    const suffix = `${Date.now()}`;
    const userEmail = `smoke+${suffix}@kajovohotel.local`;
    const userPassword = `Smoke-${suffix}-pass`;

    const createUserResponse = await request.post('/api/v1/users', {
      data: {
        email: userEmail,
        password: userPassword,
        first_name: 'Smoke',
        last_name: 'User',
        roles: ['recepce'],
      },
      headers: csrfHeaders,
    });
    expect(createUserResponse.status()).toBe(201);
    await expect(createUserResponse.json()).resolves.toMatchObject({
      email: userEmail,
      is_active: true,
    });

    const portalLoginResponse = await request.post('/api/auth/login', {
      data: { email: userEmail, password: userPassword },
    });
    expect(portalLoginResponse.ok()).toBeTruthy();
    await expect(portalLoginResponse.json()).resolves.toMatchObject({
      email: userEmail,
      actor_type: 'portal',
    });
  });

  test('admin profil uz nenabizi zmenu hesla', async ({ page, request }) => {
    const adminLoginResponse = await request.post('/api/auth/admin/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(adminLoginResponse.ok()).toBeTruthy();

    const storageState = await request.storageState();
    await page.context().addCookies(storageState.cookies);

    await page.goto('/admin/', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: /profil/i }).click();
    await expect(page.getByTestId('admin-profile-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: /profil administrátora/i })).toBeVisible();
    await expect(page.getByText(/admin účet nemá reset hesla/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /změna hesla/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /změnit heslo/i })).toHaveCount(0);
  });

  test('admin login hint zobrazi blokujici dialog az do potvrzeni odeslani', async ({ page }) => {
    await page.goto('/admin/login', { waitUntil: 'networkidle' });
    await page.getByLabel(/admin email/i).fill(ADMIN_EMAIL);
    await page.getByRole('button', { name: /zapomenuté heslo/i }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/připomenutí bylo odesláno|odeslání připomenutí selhalo/i);
  });
});
