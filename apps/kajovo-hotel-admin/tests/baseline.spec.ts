import { expect, test, type Page } from '@playwright/test';
import { getAdminCredentials } from '../test-admin-credentials';

async function geometry(page: Page) {
  await expect(page.locator('.k-wordmark-mark')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  const navigation = page.locator('.k-bottom-nav');
  await expect(navigation).toBeVisible();
  expect(await navigation.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return Math.abs(box.bottom - innerHeight) <= 1;
  })).toBeTruthy();
}

test('admin login, user write, reload and delete use the real API', async ({ page, request }, info) => {
  const credentials = getAdminCredentials();
  await page.goto('/admin/login');
  await page.getByLabel(/e-mail administrátora/i).fill(credentials.email);
  await page.getByLabel(/heslo administrátora/i).fill(credentials.password);
  await page.getByRole('button', { name: /přihlásit/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await geometry(page);
  expect((await request.post('/api/auth/admin/login', { data: credentials })).status()).toBe(200);
  const state = await request.storageState();
  const csrf = state.cookies.find((cookie) => cookie.name === 'kajovo_csrf')!.value;
  const email = `baseline-${info.project.name}-${Date.now()}@example.com`;
  const response = await request.post('/api/v1/users', {
    headers: { 'x-csrf-token': csrf },
    data: { first_name: 'CI', last_name: 'Baseline', email, roles: ['sklad'] },
  });
  expect(response.status()).toBe(201);
  const user = await response.json();
  try {
    await page.goto('/admin/uzivatele');
    const row = page.getByRole('row').filter({ hasText: email });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Upravit/ }).click();
    await page.getByLabel('Jméno *', { exact: true }).fill('Uloženo');
    await page.getByRole('button', { name: 'Další', exact: true }).click();
    await page.getByRole('button', { name: 'Další', exact: true }).click();
    await page.getByRole('button', { name: 'Uložit změny', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Uživatelé', exact: true })).toBeVisible();
    await page.reload();
    await expect(row).toContainText('Uloženo');
    expect((await (await request.get(`/api/v1/users/${user.id}`)).json()).first_name).toBe('Uloženo');
    await geometry(page);
    await page.screenshot({ path: info.outputPath('admin-users.png'), fullPage: true });
  } finally {
    expect((await request.delete(`/api/v1/users/${user.id}`, { headers: { 'x-csrf-token': csrf } })).ok()).toBeTruthy();
  }
});

test('portal login, RBAC, CSRF and chat persistence use the real API', async ({ page, request }, info) => {
  const credentials = getAdminCredentials();
  expect((await request.post('/api/auth/admin/login', { data: credentials })).status()).toBe(200);
  const state = await request.storageState();
  const csrf = state.cookies.find((cookie) => cookie.name === 'kajovo_csrf')!.value;
  const email = `portal-baseline-${info.project.name}-${Date.now()}@example.com`;
  const password = `Baseline-${Date.now()}-test`;
  const response = await request.post('/api/v1/users', {
    headers: { 'x-csrf-token': csrf },
    data: { first_name: 'CI', last_name: 'Portal', email, password, roles: ['sklad'] },
  });
  expect(response.status()).toBe(201);
  const user = await response.json();
  try {
    await page.goto('http://127.0.0.1:4173/login');
    await page.locator('#portal-email').fill(email);
    await page.locator('#portal-password').fill(password);
    await page.getByRole('button', { name: /přihlásit/i }).click();
    await expect(page).toHaveURL(/\/(sklad)?$/);
    const tabs = page.getByTestId('portal-mobile-tabs');
    await expect(tabs).toBeVisible();
    await expect(page.getByTestId('role-select-page')).toHaveCount(0);
    const links = tabs.locator('a, button');
    await expect(links.first()).toContainText('Chat');
    await expect(links.last()).toContainText('Profil');
    await expect(tabs.getByRole('link', { name: 'Snídaně', exact: true })).toHaveCount(0);
    expect((await page.request.get('http://127.0.0.1:4173/api/v1/users')).status()).toBe(403);
    expect((await page.request.post('http://127.0.0.1:4173/api/auth/activity')).status()).toBe(403);
    await page.goto('http://127.0.0.1:4173/chat');
    await page.getByRole('button', { name: new RegExp(credentials.email, 'i') }).click();
    const message = `CI persistence ${info.project.name} ${Date.now()}`;
    await page.getByLabel('Napište zprávu').fill(message);
    await page.getByRole('button', { name: 'Odeslat', exact: true }).click();
    await expect(page.locator('.k-chat-bubble.is-own').last()).toContainText(message);
    await page.reload();
    await expect(page.locator('.k-chat-bubble.is-own').last()).toContainText(message);
    await geometry(page);
    await page.screenshot({ path: info.outputPath('portal-chat.png'), fullPage: true });
    await page.getByRole('button', { name: /odhlásit/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get('http://127.0.0.1:4173/api/auth/me')).status()).toBe(401);
  } finally {
    expect((await request.delete(`/api/v1/users/${user.id}`, { headers: { 'x-csrf-token': csrf } })).ok()).toBeTruthy();
  }
});
