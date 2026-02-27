import { expect, test, type APIRequestContext } from '@playwright/test';

const ADMIN_EMAIL = 'admin@kajovohotel.local';
const ADMIN_PASSWORD = 'admin123';

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

    const suffix = `${Date.now()}`;
    const userEmail = `smoke+${suffix}@kajovohotel.local`;
    const userPassword = `Smoke-${suffix}-pass`;

    const createUserResponse = await request.post('/api/v1/users', {
      data: { email: userEmail, password: userPassword },
      headers: csrfHeaders,
    });
    expect(createUserResponse.status()).toBe(201);
    await expect(createUserResponse.json()).resolves.toMatchObject({
      email: userEmail,
      roles: ['recepce'],
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
});
