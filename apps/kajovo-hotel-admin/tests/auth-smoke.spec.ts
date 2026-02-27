import { expect, request, test } from '@playwright/test';

type Cookie = {
  name: string;
  value: string;
};

const fixedAdmin = {
  email: 'admin@kajovohotel.local',
  password: 'admin123',
};

const getCookie = async (api: Awaited<ReturnType<typeof request.newContext>>, name: string): Promise<Cookie | undefined> => {
  const state = await api.storageState();
  return state.cookies.find((cookie) => cookie.name === name);
};

const csrfHeader = async (api: Awaited<ReturnType<typeof request.newContext>>): Promise<Record<string, string>> => {
  const token = await getCookie(api, 'kajovo_csrf');
  return token ? { 'x-csrf-token': token.value } : {};
};

test.describe('Auth smoke scenarios', () => {
  test('admin login (fixed admin) is deterministic', async ({ baseURL }) => {
    const api = await request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });

    const invalid = await api.post('/api/auth/admin/login', {
      data: { email: fixedAdmin.email, password: 'wrong-password' },
    });
    expect(invalid.status()).toBe(401);

    const response = await api.post('/api/auth/admin/login', {
      data: { email: fixedAdmin.email, password: fixedAdmin.password },
    });
    expect(response.status()).toBe(200);

    const payload = await response.json();
    expect(payload).toMatchObject({
      email: fixedAdmin.email,
      role: 'admin',
      actor_type: 'admin',
    });

    const session = await getCookie(api, 'kajovo_session');
    const csrf = await getCookie(api, 'kajovo_csrf');
    expect(session).toBeTruthy();
    expect(csrf).toBeTruthy();

    await api.dispose();
  });

  test('hint email flow returns stable response in mock transport mode', async ({ baseURL }) => {
    const api = await request.newContext({ baseURL });

    const login = await api.post('/api/auth/admin/login', {
      data: { email: fixedAdmin.email, password: fixedAdmin.password },
    });
    expect(login.status()).toBe(200);

    const response = await api.post('/api/auth/admin/hint', {
      data: { email: fixedAdmin.email },
      headers: await csrfHeader(api),
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const unknownResponse = await api.post('/api/auth/admin/hint', {
      data: { email: 'unknown@kajovohotel.local' },
      headers: await csrfHeader(api),
    });
    expect(unknownResponse.status()).toBe(200);
    await expect(unknownResponse.json()).resolves.toEqual({ ok: true });

    await api.dispose();
  });

  test('user create + portal login', async ({ baseURL }) => {
    const adminApi = await request.newContext({ baseURL });

    const login = await adminApi.post('/api/auth/admin/login', {
      data: { email: fixedAdmin.email, password: fixedAdmin.password },
    });
    expect(login.status()).toBe(200);

    const unique = Date.now();
    const portalUser = {
      email: `portal-smoke-${unique}@kajovohotel.local`,
      password: `Portal-${unique}!`,
    };

    const createResponse = await adminApi.post('/api/v1/users', {
      data: portalUser,
      headers: await csrfHeader(adminApi),
    });
    expect(createResponse.status()).toBe(201);
    await expect(createResponse.json()).resolves.toMatchObject({
      email: portalUser.email,
      role: 'manager',
      is_active: true,
    });

    const portalApi = await request.newContext({ baseURL });
    const portalLogin = await portalApi.post('/api/auth/login', {
      data: portalUser,
    });
    expect(portalLogin.status()).toBe(200);
    await expect(portalLogin.json()).resolves.toMatchObject({
      email: portalUser.email,
      actor_type: 'portal',
    });

    const me = await portalApi.get('/api/auth/me');
    expect(me.status()).toBe(200);
    await expect(me.json()).resolves.toMatchObject({ email: portalUser.email, actor_type: 'portal' });

    await portalApi.dispose();
    await adminApi.dispose();
  });
});
