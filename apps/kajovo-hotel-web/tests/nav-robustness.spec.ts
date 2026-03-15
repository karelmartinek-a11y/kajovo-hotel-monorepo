import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'qa@example.com',
        role: 'pokojská',
        permissions: ['housekeeping:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read'],
        actor_type: 'portal',
      }),
    });
  });

  await page.route('**/api/v1/lost-found**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/v1/issues**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/v1/reports**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
});

test('desktop keeps core portal modules accessible', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');

  const nav = page.getByTestId('module-navigation-desktop');
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Pokojská' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Snídaně' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Ztráty a nálezy' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Závady' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Skladové hospodářství' })).toBeVisible();
});

test('tablet collapses earlier and keeps overflow available', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1180 });
  await page.goto('/');

  const nav = page.getByTestId('module-navigation-desktop');
  await expect(nav).toBeVisible();

  const skladLink = nav.getByRole('link', { name: 'Skladové hospodářství' });
  const skladVisible = (await skladLink.count()) > 0 && await skladLink.first().isVisible();

  if (!skladVisible) {
    const moreButton = nav.getByRole('button', { name: 'Další' });
    await moreButton.click();
    await expect(nav.getByRole('menuitem', { name: 'Skladové hospodářství' })).toBeVisible();
  }
});

test('phone uses drawer navigation with search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const phoneNav = page.getByTestId('module-navigation-phone');
  await expect(phoneNav).toBeVisible();

  await phoneNav.getByRole('button', { name: 'Menu' }).click();
  const search = phoneNav.getByPlaceholder('Hledat v menu');
  await expect(search).toBeVisible();

  await search.fill('ztr');
  await expect(phoneNav.getByRole('menuitem', { name: 'Ztráty a nálezy' })).toBeVisible();
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
