import { expect, test, type Page, type Route } from '@playwright/test';

const adminPath = (path: string): string => {
  if (path.startsWith('/admin')) {
    return path;
  }
  return `/admin${path.startsWith('/') ? '' : '/'}${path}`;
};

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
    actor_type: 'admin',
  });

  await page.goto(adminPath('/'));
  await expect(page.getByRole('link', { name: 'Skladové hospodářství' })).toHaveCount(0);

  await page.goto(adminPath('/sklad'));
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
  await expect(page.getByText('Přístup odepřen')).toBeVisible();
  await expect(page.getByText(/Role údržba/)).toBeVisible();
});

test('admin override keeps all modules visible and accessible', async ({ page }) => {
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['dashboard:read', 'housekeeping:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read', 'reports:read', 'users:read', 'settings:read'],
    actor_type: 'admin',
  });
  await page.route('**/api/v1/inventory**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto(adminPath('/'));
  const viewport = page.viewportSize();
  const isPhone = viewport ? viewport.width <= 767 : false;
  const phoneNav = page.getByTestId('module-navigation-phone');
  if (isPhone) {
    await phoneNav.getByRole('button', { name: 'Menu' }).click();
    await expect(phoneNav.getByRole('menuitem', { name: 'Skladové hospodářství' })).toBeVisible();
  } else {
    const desktopNav = page.getByTestId('module-navigation-desktop');
    const directLink = desktopNav.getByRole('link', { name: 'Skladové hospodářství' });
    if (await directLink.isVisible()) {
      await expect(directLink).toBeVisible();
    } else {
      const moreButton = desktopNav.getByRole('button', { name: 'Další' });
      if (await moreButton.isVisible()) {
        await moreButton.click();
        await expect(desktopNav.getByRole('menuitem', { name: 'Skladové hospodářství' })).toBeVisible();
      } else {
        await expect(directLink).toBeVisible();
      }
    }
  }

  await page.goto(adminPath('/sklad'));
  await expect(page.getByTestId('inventory-list-page')).toBeVisible();
});
