import { expect, test } from '@playwright/test';

test.describe('visual states', () => {
  test('dashboard snapshot', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page).toHaveScreenshot('dashboard.png', { fullPage: true });
  });

  test('module list snapshot', async ({ page }) => {
    await page.goto('/snidane');
    await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
    await expect(page).toHaveScreenshot('breakfast-list.png', { fullPage: true });
  });

  test('module detail snapshot', async ({ page }) => {
    await page.goto('/snidane/sn-101');
    await expect(page.getByTestId('breakfast-detail-page')).toBeVisible();
    await expect(page).toHaveScreenshot('breakfast-detail.png', { fullPage: true });
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
