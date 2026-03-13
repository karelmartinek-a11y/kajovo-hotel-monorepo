import { expect, test, type Page, type Route } from '@playwright/test';

type AuthPayload = {
  email: string;
  role: string;
  permissions: string[];
  actor_type: 'admin' | 'portal';
};

async function mockAuth(page: Page, payload: AuthPayload): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

async function mockAuthFailure(page: Page, status: number, detail = 'Auth service unavailable'): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ detail }),
    });
  });
}

test('restricted module is hidden in navigation and shows access denied on direct URL', async ({ page }) => {
  await mockAuth(page, {
    email: 'udrzba@example.com',
    role: 'udrzba',
    permissions: ['issues:read', 'issues:write'],
    actor_type: 'portal',
  });
  await page.route('**/api/v1/issues**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await expect(page.getByRole('link', { name: /Sklad/i })).toHaveCount(0);

  await page.goto('/sklad');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: /odep/i })).toBeVisible();
  await expect(page.getByText(/udrzba@example\.com/i)).toBeVisible();
});

test('recepce navigation contains only breakfast and lost-found', async ({ page }) => {
  await mockAuth(page, {
    email: 'recepce@example.com',
    role: 'recepce',
    permissions: ['breakfast:read', 'lost_found:read'],
    actor_type: 'portal',
  });
  await page.route('**/api/v1/lost-found**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  const viewport = page.viewportSize();
  const isPhone = (viewport?.width ?? 0) <= 767;

  if (isPhone) {
    const phoneNav = page.getByTestId('module-navigation-phone');
    await phoneNav.getByRole('button', { name: 'Menu' }).click();
    await expect(phoneNav.getByRole('menuitem', { name: /Sn.dan/i })).toBeVisible();
    await expect(phoneNav.getByRole('menuitem', { name: /Ztr.ty/i })).toBeVisible();
    await expect(phoneNav.getByRole('menuitem', { name: /Z.vady/i })).toHaveCount(0);
    await expect(phoneNav.getByRole('menuitem', { name: /Sklad/i })).toHaveCount(0);
  } else {
    await expect(page.getByRole('link', { name: /Sn.dan/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Ztr.ty/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Z.vady/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Sklad/i })).toHaveCount(0);
  }
});

test('recepce deep link do zakázaných modulů zůstává odepřený', async ({ page }) => {
  await mockAuth(page, {
    email: 'recepce@example.com',
    role: 'recepce',
    permissions: ['breakfast:read', 'lost_found:read'],
    actor_type: 'portal',
  });

  await page.goto('/hlaseni');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();

  await page.goto('/zavady');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();

  await page.goto('/sklad');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
});


  await page.goto('/admin');
  await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
  await expect(page.getByText('Admin je presunut do samostatne aplikace')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Otevrit admin aplikaci' })).toBeVisible();
});
