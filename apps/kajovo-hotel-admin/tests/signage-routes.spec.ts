import { expect, test } from '@playwright/test';

const keyRoutes = ['/', '/snidane', '/ztraty-a-nalezy'];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/breakfast?*', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/breakfast/daily-summary?*', async (route) =>
    route.fulfill({ json: { service_date: '2026-02-19', total_orders: 0, total_guests: 0, status_counts: { pending: 0, preparing: 0, served: 0, cancelled: 0 } } })
  );
  await page.route('**/api/v1/lost-found?*', async (route) => route.fulfill({ json: [] }));
});

test('signace is present on key routes', async ({ page }) => {
  for (const route of keyRoutes) {
    await page.goto(route);
    const signace = page.getByTestId('kajovo-sign');
    await expect(signace, `Missing signace on ${route}`).toBeVisible();
    await expect(signace.locator('img')).toHaveAttribute('src', /signace\.svg/);
  }
});
