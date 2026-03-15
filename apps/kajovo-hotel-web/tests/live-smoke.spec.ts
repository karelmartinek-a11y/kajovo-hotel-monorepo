import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { getAdminCredentials } from '../test-admin-credentials';

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = getAdminCredentials();

async function csrfHeaderFor(context: APIRequestContext) {
  const state = await context.storageState();
  const csrf = state.cookies.find((cookie: { name: string; value: string }) => cookie.name === 'kajovo_csrf')?.value;
  expect(csrf, 'Expected CSRF cookie after admin login').toBeTruthy();
  return { 'x-csrf-token': csrf! };
}

test('portal bez session skonci na loginu', async ({ page }) => {
  await page.goto('/snidane', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('portal-login-page')).toBeVisible();
});

test('portal auth endpoint funguje nad realnym API a web admin surface zustava retired', async ({ page, request }, testInfo) => {
  const adminLoginResponse = await request.post('/api/auth/admin/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(adminLoginResponse.ok()).toBeTruthy();

  const csrfHeaders = await csrfHeaderFor(request);
  const suffix = `${testInfo.project.name}-${testInfo.parallelIndex}-${randomUUID()}`;
  const portalEmail = `web-live-${suffix}@kajovohotel.local`;
  const portalPassword = `WebLive-${suffix}-pass`;

  const createUserResponse = await request.post('/api/v1/users', {
    data: {
      email: portalEmail,
      password: portalPassword,
      first_name: 'Web',
      last_name: 'Smoke',
      roles: ['recepce'],
    },
    headers: csrfHeaders,
  });
  expect(createUserResponse.status()).toBe(201);

  const portalLoginResponse = await request.post('/api/auth/login', {
    data: { email: portalEmail, password: portalPassword },
  });
  expect(portalLoginResponse.ok()).toBeTruthy();
  await expect(portalLoginResponse.json()).resolves.toMatchObject({
    email: portalEmail,
    actor_type: 'portal',
  });

  await page.goto('/admin/uzivatele', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
});
