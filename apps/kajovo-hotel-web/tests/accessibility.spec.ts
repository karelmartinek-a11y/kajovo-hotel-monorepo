import { expect, test, type Page } from '@playwright/test';

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
