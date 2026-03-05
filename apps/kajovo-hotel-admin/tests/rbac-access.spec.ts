import { expect, test } from '@playwright/test';

type AuthPayload = {
  email: string;
  role: string;
  permissions: string[];
  actor_type: 'admin' | 'portal';
};

async function mockAuth(page, payload: AuthPayload): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

test('restricted module is hidden in navigation and shows access denied on direct URL', async ({ page }) => {
  await mockAuth(page, {
    email: 'udrzba@example.com',
    role: 'údržba',
    permissions: ['issues:read', 'issues:write'],
    actor_type: 'admin',
  });

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Skladové hospodáøství' })).toHaveCount(0);

  await page.goto('/sklad');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
  await expect(page.getByText('Pøístup odepøen')).toBeVisible();
  await expect(page.getByText(/Role údržba/)).toBeVisible();
});

test('admin override keeps all modules visible and accessible', async ({ page }) => {
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read', 'reports:read', 'users:read', 'settings:read'],
    actor_type: 'admin',
  });
  await page.route('**/api/v1/inventory**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Skladové hospodáøství' })).toBeVisible();

  await page.goto('/sklad');
  await expect(page.getByTestId('inventory-list-page')).toBeVisible();
});
