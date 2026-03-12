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

test('restricted module is hidden in navigation and shows access denied on direct URL', async ({ page }) => {
  await mockAuth(page, {
    email: 'udrzba@example.com',
    role: 'údržba',
    permissions: ['issues:read', 'issues:write'],
    actor_type: 'portal',
  });
  await page.route('**/api/v1/issues**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Skladové hospodářství' })).toHaveCount(0);

  await page.goto('/sklad');
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
  await expect(page.getByText('Přístup odepřen')).toBeVisible();
  await expect(page.getByText(/Role\s+údržba/i)).toBeVisible();
});

test('recepce navigace obsahuje jen snídaně a nálezy', async ({ page }) => {
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
    await expect(phoneNav.getByRole('menuitem', { name: 'Snídaně' })).toBeVisible();
    await expect(phoneNav.getByRole('menuitem', { name: 'Ztráty a nálezy' })).toBeVisible();
    await expect(phoneNav.getByRole('menuitem', { name: 'Závady' })).toHaveCount(0);
    await expect(phoneNav.getByRole('menuitem', { name: 'Skladové hospodářství' })).toHaveCount(0);
  } else {
    await expect(page.getByRole('link', { name: 'Snídaně' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ztráty a nálezy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Závady' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Skladové hospodářství' })).toHaveCount(0);
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


test('admin rozhraní nabízí přepínání klíčových modulů', async ({ page }) => {
  await page.goto('/admin');
  await page.waitForSelector('[data-testid="module-navigation-desktop"], [data-testid="module-navigation-phone"]', { state: 'attached' });
  const expectedModules = [
    'Snídaně',
    'Skladové hospodářství',
    'Závady',
    'Pokojská',
    'Ztráty a nálezy',
  ];

  const desktopNav = page.getByTestId('module-navigation-desktop');
  const phoneNav = page.getByTestId('module-navigation-phone');
  for (const label of expectedModules) {
    const pattern = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const link = desktopNav.getByRole('link', { name: pattern });
    if ((await link.count()) > 0) {
      expect(await link.first().isVisible()).toBeTruthy();
      continue;
    }

    const overflowButton = desktopNav.getByRole('button', { name: 'Další' });
    if ((await overflowButton.count()) > 0) {
      await overflowButton.first().click();
      const menuItem = desktopNav.getByRole('menuitem', { name: pattern });
      await expect(menuItem).toBeVisible();
      continue;
    }

    const phoneToggle = phoneNav.getByRole('button', { name: /Menu/i });
    if ((await phoneToggle.count()) > 0) {
      const expanded = await phoneToggle.first().getAttribute('aria-expanded');
      if (expanded !== 'true') {
        await phoneToggle.first().click();
      }
      await expect(phoneNav.getByRole('menuitem', { name: pattern })).toBeVisible();
      continue;
    }

    throw new Error(`Module ${label} not found in admin navigation`);
  }
});
