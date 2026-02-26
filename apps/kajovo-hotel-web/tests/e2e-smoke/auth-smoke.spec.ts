import { expect, test } from '@playwright/test';

test('admin login, hint flow, and user bootstrap to portal login are deterministic', async ({ browser }) => {
  test.setTimeout(90_000);
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

  await adminPage.goto('/login', { waitUntil: 'networkidle' });
  await adminPage.waitForSelector('#admin_login_email', { state: 'visible' });
  await adminPage.locator('#admin_login_email').fill('admin@kajovohotel.local');
  await adminPage.locator('#admin_login_password').fill('admin123');
  await adminPage.getByRole('button', { name: 'Přihlásit' }).click();
  await expect(adminPage.getByTestId('dashboard-page')).toBeVisible();

  await adminPage.goto('/login', { waitUntil: 'networkidle' });
  await adminPage.waitForSelector('#admin_login_email', { state: 'visible' });
  await adminPage.locator('#admin_login_email').fill('admin@kajovohotel.local');
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
  await portalPage.waitForSelector('#portal_login_email', { state: 'visible' });
  await portalPage.locator('#portal_login_email').fill(portalEmail);
  await portalPage.locator('#portal_login_password').fill(portalPassword);
  await portalPage.getByRole('button', { name: 'Přihlásit' }).click();
  await expect(portalPage.getByTestId('dashboard-page')).toBeVisible();

  await portalContext.close();
  await adminContext.close();
});
