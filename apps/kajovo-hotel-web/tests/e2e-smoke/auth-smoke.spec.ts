import { expect, test } from '@playwright/test';

test('admin login, hint flow, and user bootstrap to portal login are deterministic', async ({ browser }) => {
  const unique = Date.now();
  const portalEmail = `smoke.user.${unique}@kajovohotel.local`;
  const portalPassword = `SmokePass-${unique}`;

  const adminContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  const adminPage = await adminContext.newPage();

  await adminPage.goto('/login');
  await adminPage.locator('#admin_login_email').fill('admin@kajovohotel.local');
  await adminPage.locator('#admin_login_password').fill('admin123');
  await adminPage.getByRole('button', { name: 'Přihlásit' }).click();
  await expect(adminPage.getByTestId('dashboard-page')).toBeVisible();

  await adminPage.goto('/login');
  await adminPage.locator('#admin_login_email').fill('admin@kajovohotel.local');
  await adminPage.getByRole('button', { name: 'Poslat hint hesla' }).click();
  await expect(adminPage.getByText('Pokud email odpovídá admin účtu, byl odeslán hint hesla.')).toBeVisible();

  await adminPage.goto('/uzivatele');
  await expect(adminPage.getByTestId('users-admin-page')).toBeVisible();
  await adminPage.locator('#user_email').fill(portalEmail);
  await adminPage.locator('#user_password').fill(portalPassword);
  await adminPage.getByRole('button', { name: 'Vytvořit uživatele' }).click();
  await expect(adminPage.getByText(portalEmail)).toBeVisible();

  const portalContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4174' });
  const portalPage = await portalContext.newPage();

  await portalPage.goto('/login');
  await portalPage.locator('#portal_login_email').fill(portalEmail);
  await portalPage.locator('#portal_login_password').fill(portalPassword);
  await portalPage.getByRole('button', { name: 'Přihlásit' }).click();
  await expect(portalPage.getByTestId('dashboard-page')).toBeVisible();

  await portalContext.close();
  await adminContext.close();
});
