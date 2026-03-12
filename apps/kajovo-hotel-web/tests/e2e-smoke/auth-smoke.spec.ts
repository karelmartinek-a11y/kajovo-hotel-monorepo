import { expect, test } from '@playwright/test';

type EnvMap = Record<string, string | undefined>;

const readEnv = (key: string): string | undefined =>
  (globalThis as { process?: { env?: EnvMap } }).process?.env?.[key];

const ADMIN_EMAIL = readEnv('KAJOVO_API_ADMIN_EMAIL') ?? readEnv('HOTEL_ADMIN_EMAIL') ?? 'admin@kajovohotel.local';
const ADMIN_PASSWORD = readEnv('KAJOVO_API_ADMIN_PASSWORD') ?? readEnv('HOTEL_ADMIN_PASSWORD') ?? 'admin123';

test('admin login, hint flow, and user bootstrap to portal login are deterministic', async ({ browser }) => {
  test.setTimeout(150_000);
  const unique = Date.now();
  const portalEmail = `smoke.user.${unique}@kajovohotel.local`;
  const portalPassword = `SmokePass-${unique}`;

  const adminContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  const adminPage = await adminContext.newPage();

  // Stabilizace hint flow: mock endpoint odpovědi (transport flow zůstává na API unit/integration vrstvách).
  await adminPage.route('**/api/auth/admin/hint', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await adminPage.goto('/login');
  await adminPage.locator('#admin_login_email').fill(ADMIN_EMAIL);
  await adminPage.locator('#admin_login_password').fill(ADMIN_PASSWORD);
  await adminPage.getByRole('button', { name: 'Přihlásit' }).click();
  await expect(adminPage.getByTestId('dashboard-page')).toBeVisible();

  await adminPage.goto('/login');
  await adminPage.locator('#admin_login_email').fill(ADMIN_EMAIL);
  await adminPage.getByRole('button', { name: 'Poslat hint hesla' }).click();
  await expect(adminPage.getByText('Pokud email odpovídá admin účtu, byl odeslán hint hesla.')).toBeVisible();

  await adminPage.goto('/uzivatele', { waitUntil: 'networkidle' });
  await expect(adminPage.getByTestId('users-admin-page')).toBeVisible();
  await adminPage.locator('#user_email').fill(portalEmail);
  await adminPage.locator('#user_password').fill(portalPassword);
  await adminPage.getByRole('button', { name: 'Vytvořit uživatele' }).click();
  await expect(adminPage.getByText(portalEmail)).toBeVisible();

  const portalContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4174' });
  const portalPage = await portalContext.newPage();

  await portalPage.goto('/login', { waitUntil: 'networkidle' });
  await portalPage.waitForSelector('#portal_login_email', { state: 'visible', timeout: 120_000 });
  await portalPage.locator('#portal_login_email').fill(portalEmail);
  await portalPage.locator('#portal_login_password').fill(portalPassword);
  await portalPage.getByRole('button', { name: 'Přihlásit' }).click();
  await expect(portalPage.getByTestId('dashboard-page')).toBeVisible();

  await portalContext.close();
  await adminContext.close();
});
