import { expect, test, type Page } from '@playwright/test';
import { getAdminCredentials } from '../test-admin-credentials';

const { email: ADMIN_EMAIL } = getAdminCredentials();

async function mockAuth(page: Page, status: number, payload: Record<string, unknown>): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

test('retired admin gateway exposes actionable links', async ({ page }) => {
  await mockAuth(page, 401, { detail: 'Not authenticated' });

  await page.goto('/admin/login');

  await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Otevrit admin aplikaci' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Portal login' })).toBeVisible();
});

test('admin gateway stays readable even when auth session exists', async ({ page }) => {
  await mockAuth(page, 200, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['users:read'],
    actor_type: 'admin',
  });

  await page.goto('/admin/uzivatele');

  await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
  await expect(page.getByText('Webovy runtime uz neobsahuje vlozeny admin panel.')).toBeVisible();
});


test('admin login renders structured error dialog on invalid and locked credentials', async ({ page }) => {
  await page.route('**/api/auth/admin/login', async (route) => {
    const payload = route.request().postDataJSON() as { password?: string };
    if (payload.password === 'locked-pass') {
      await route.fulfill({
        status: 423,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Account locked' }),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Invalid credentials' }),
    });
  });

  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/heslo/i).fill('wrong-password');
  await page.getByRole('button', { name: /přihlásit/i }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /přihlášení se nezdařilo/i })).toBeVisible();
  await expect(dialog).toContainText(/zkontrolujte email a heslo/i);

  await page.getByLabel(/heslo/i).fill('locked-pass');
  await page.getByRole('button', { name: /přihlásit/i }).click();
  await expect(dialog).toContainText(/účet je dočasně uzamčen/i);
});
