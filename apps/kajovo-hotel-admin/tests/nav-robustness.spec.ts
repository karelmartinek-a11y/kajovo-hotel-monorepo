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

async function openAdminNavItem(page: Page, label: RegExp): Promise<void> {
  const desktopNav = page.getByTestId('module-navigation-desktop');
  const directLink = desktopNav.getByRole('link', { name: label });
  if (await directLink.count()) {
    await directLink.first().click();
    return;
  }

  const moreButton = desktopNav.getByRole('button', { name: /Dal/i });
  await expect(moreButton).toBeVisible();
  await moreButton.click();
  await desktopNav.getByRole('menuitem', { name: label }).click();
}

test.beforeEach(async ({ page }) => {
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['dashboard:read', 'housekeeping:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read', 'reports:read', 'users:read', 'settings:read'],
    actor_type: 'admin',
  });
});

test('desktop keeps core admin modules accessible', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(adminPath('/'));

  const nav = page.getByTestId('module-navigation-desktop');
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Snídaně' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Ztráty a nálezy' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Závady' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Skladové hospodářství' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Profil' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Uživatelé' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Nastavení' })).toBeVisible();
});

test('tablet collapses earlier and keeps overflow available', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1180 });
  await page.goto(adminPath('/'));

  const nav = page.getByTestId('module-navigation-desktop');
  await expect(nav).toBeVisible();

  const inventoryLink = nav.getByRole('link', { name: /Skladov/i });
  if (await inventoryLink.count()) {
    await expect(inventoryLink).toBeVisible();
    return;
  }

  const moreButton = nav.getByRole('button', { name: /Dal/i });
  await expect(moreButton).toBeVisible();
  await moreButton.click();
  await expect(nav.getByRole('menuitem', { name: /Skladov/i })).toBeVisible();
});

test('phone uses drawer navigation with search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(adminPath('/'));

  const phoneNav = page.getByTestId('module-navigation-phone');
  await expect(phoneNav).toBeVisible();

  await phoneNav.getByRole('button', { name: 'Menu' }).click();
  const search = phoneNav.getByPlaceholder('Hledat v menu');
  await expect(search).toBeVisible();

  await search.fill('nast');
  await expect(phoneNav.getByRole('menuitem', { name: 'Nastavení' })).toBeVisible();
  await expect(phoneNav.getByRole('menuitem', { name: /Sn.dan/i })).not.toBeVisible();
});

test('page has no horizontal overflow outside table containers', async ({ page }) => {
  await page.goto('/');

  const hasHorizontalOverflow = await page.evaluate(() => {
    const rootOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    const bodyOverflow = document.body.scrollWidth > document.body.clientWidth;

    const containerOverflow = Array.from(document.querySelectorAll<HTMLElement>('*')).some((el) => {
      if (el.scrollWidth <= el.clientWidth) {
        return false;
      }
      return !el.classList.contains('k-table-wrap');
    });

    return rootOverflow || bodyOverflow || containerOverflow;
  });

  expect(hasHorizontalOverflow).toBeFalsy();
});

test('admin menu links open concrete admin routes instead of internal 404', async ({ page }) => {
  await page.route('**/api/v1/users', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/v1/admin/profile', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          email: 'admin@example.com',
          display_name: 'Admin',
          password_changed_at: null,
          updated_at: null,
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto(adminPath('/'));

  const isPhone = (page.viewportSize()?.width ?? 0) <= 767;
  if (isPhone) {
    const phoneNav = page.getByTestId('module-navigation-phone');
    await expect(phoneNav).toBeVisible();
    await phoneNav.getByRole('button', { name: 'Menu' }).click();
    await phoneNav.getByRole('menuitem', { name: /U.*ivatel/i }).click();
  } else {
    await expect(page.getByTestId('module-navigation-desktop')).toBeVisible();
    await openAdminNavItem(page, /U.*ivatel/i);
  }
  await expect(page).toHaveURL(/\/admin\/uzivatele$/);
  await expect(page.getByTestId('users-admin-page')).toBeVisible();
  await expect(page.getByText(/Str.nka nebyla nalezena\./i)).toHaveCount(0);

  if (isPhone) {
    const phoneNav = page.getByTestId('module-navigation-phone');
    await phoneNav.getByRole('button', { name: 'Menu' }).click();
    await phoneNav.getByRole('menuitem', { name: /Nastaven/i }).click();
  } else {
    await openAdminNavItem(page, /Nastaven/i);
  }
  await expect(page).toHaveURL(/\/admin\/nastaveni$/);
  await expect(page.getByTestId('settings-admin-page')).toBeVisible();
  await expect(page.getByText(/Str.nka nebyla nalezena\./i)).toHaveCount(0);

  if (isPhone) {
    const phoneNav = page.getByTestId('module-navigation-phone');
    await phoneNav.getByRole('button', { name: 'Menu' }).click();
    await phoneNav.getByRole('menuitem', { name: 'Profil' }).click();
  } else {
    await openAdminNavItem(page, /Profil/i);
  }
  await expect(page).toHaveURL(/\/admin\/profil$/);
  await expect(page.getByTestId('admin-profile-page')).toBeVisible();
  await expect(page.getByText(/Str.nka nebyla nalezena\./i)).toHaveCount(0);
});
