import { expect, test, type Page } from '@playwright/test';

async function mockUnauthenticatedAdmin(page: Page): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    });
  });
}

async function mockAdmin(page: Page): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'admin@example.com',
        role: 'admin',
        permissions: ['users:read', 'users:write'],
        actor_type: 'admin',
      }),
    });
  });
}

test('web users admin route is retired for unauthenticated browser too', async ({ page }) => {
  await mockUnauthenticatedAdmin(page);

  await page.goto('/admin/uzivatele');

  await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Portal login' })).toBeVisible();
});

test('web users admin route never renders embedded CRUD even for admin session', async ({ page }) => {
  await mockAdmin(page);

  await page.goto('/admin/uzivatele');

  await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
  await expect(page.getByTestId('users-admin-page')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Otevrit admin aplikaci' })).toBeVisible();
});
