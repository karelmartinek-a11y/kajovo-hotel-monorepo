import { expect, test } from '@playwright/test';

const listPayload = [
  {
    id: 1,
    service_date: '2026-02-19',
    room_number: '101',
    guest_name: 'Novák',
    guest_count: 2,
    status: 'pending',
    note: 'Bez lepku',
  },
  {
    id: 2,
    service_date: '2026-02-19',
    room_number: '205',
    guest_name: 'Svoboda',
    guest_count: 1,
    status: 'served',
    note: 'Standard',
  },
];

const summaryPayload = {
  service_date: '2026-02-19',
  total_orders: 2,
  total_guests: 3,
  status_counts: {
    pending: 1,
    preparing: 0,
    served: 1,
    cancelled: 0,
  },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/breakfast?service_date=2026-02-19', async (route) => {
    await route.fulfill({ json: listPayload });
  });

  await page.route('**/api/v1/breakfast/daily-summary?service_date=2026-02-19', async (route) => {
    await route.fulfill({ json: summaryPayload });
  });

  await page.route('**/api/v1/breakfast/1', async (route) => {
    await route.fulfill({ json: listPayload[0] });
  });
});

test.describe('visual states', () => {
  test('dashboard snapshot', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page).toHaveScreenshot('dashboard.png', { fullPage: true });
  });

  test('breakfast list snapshot', async ({ page }) => {
    await page.goto('/snidane');
    await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
    await expect(page).toHaveScreenshot('breakfast-list.png', { fullPage: true });
  });

  test('breakfast detail snapshot', async ({ page }) => {
    await page.goto('/snidane/1');
    await expect(page.getByTestId('breakfast-detail-page')).toBeVisible();
    await expect(page).toHaveScreenshot('breakfast-detail.png', { fullPage: true });
  });

  test('breakfast edit snapshot', async ({ page }) => {
    await page.goto('/snidane/1/edit');
    await expect(page.getByTestId('breakfast-edit-page')).toBeVisible();
    await expect(page).toHaveScreenshot('breakfast-edit.png', { fullPage: true });
  });

  test('signage stays visible while scrolling', async ({ page }) => {
    await page.goto('/snidane');
    const sign = page.getByTestId('kajovo-sign');
    await expect(sign).toBeVisible();
    const before = await sign.boundingBox();
    await page.mouse.wheel(0, 5000);
    const after = await sign.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    if (before && after) {
      expect(Math.round(before.y)).toBe(Math.round(after.y));
      expect(Math.round(before.x)).toBe(Math.round(after.x));
    }
  });
});
