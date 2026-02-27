import { expect, test } from '@playwright/test';

const extraModules = [
  { key: 'fake-1', label: 'Recepce+', route: '/fake/recepce', active: true, section: 'operations' },
  { key: 'fake-2', label: 'Spa+', route: '/fake/spa', active: true, section: 'operations' },
  { key: 'fake-3', label: 'Transfer+', route: '/fake/transfer', active: true, section: 'records' },
];

test.beforeEach(async ({ page }) => {

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'qa@example.com',
        role: 'manager',
        permissions: ['dashboard:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read', 'reports:read'],
        actor_type: 'portal',
      }),
    });
  });

  await page.route('**/api/v1/lost-found**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/v1/issues**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/v1/reports**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.addInitScript((modules) => {
    (window as Window & { __KAJOVO_TEST_NAV__?: { modules: unknown[] } }).__KAJOVO_TEST_NAV__ = { modules };
  }, extraModules);
});

test('desktop keeps overflow accessible with +3 injected items', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');

  const nav = page.getByTestId('module-navigation-desktop');
  await expect(nav).toBeVisible();

  const moreButton = nav.getByRole('button', { name: 'Další' });
  await expect(moreButton).toBeVisible();
  await moreButton.click();

  await expect(nav.getByRole('link', { name: 'Recepce+' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Spa+' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Transfer+' })).toBeVisible();
});

test('tablet collapses earlier and keeps overflow available', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1180 });
  await page.goto('/');

  const nav = page.getByTestId('module-navigation-desktop');
  await expect(nav).toBeVisible();

  await expect(nav.getByRole('link', { name: 'Skladové hospodářství' })).not.toBeVisible();
  const moreButton = nav.getByRole('button', { name: 'Další' });
  await moreButton.click();
  await expect(nav.getByRole('link', { name: 'Skladové hospodářství' })).toBeVisible();
});

test('phone uses drawer navigation with search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const phoneNav = page.getByTestId('module-navigation-phone');
  await expect(phoneNav).toBeVisible();

  await phoneNav.getByRole('button', { name: 'Menu' }).click();
  const search = phoneNav.getByPlaceholder('Hledat v menu');
  await expect(search).toBeVisible();

  await search.fill('spa');
  await expect(phoneNav.getByRole('menuitem', { name: 'Spa+' })).toBeVisible();
  await expect(phoneNav.getByRole('menuitem', { name: 'Snídaně' })).not.toBeVisible();
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
