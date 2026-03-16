import { expect, test, type Locator, type Page } from '@playwright/test';
import { getAdminCredentials } from '../test-admin-credentials';

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = getAdminCredentials();

type ViewCheck = {
  name: string;
  path: string;
  readyTestId?: string;
};

const publicViews: ViewCheck[] = [
  { name: 'admin-login', path: '/admin/login', readyTestId: 'admin-login-page' },
  { name: 'offline', path: '/admin/offline' },
  { name: 'maintenance', path: '/admin/maintenance' },
  { name: '404', path: '/admin/404' },
];

const adminViews: ViewCheck[] = [
  { name: 'dashboard', path: '/admin/', readyTestId: 'dashboard-page' },
  { name: 'snídaně', path: '/admin/snidane', readyTestId: 'breakfast-list-page' },
  { name: 'pokojská', path: '/admin/pokojska', readyTestId: 'housekeeping-admin-page' },
  { name: 'ztráty a nálezy', path: '/admin/ztraty-a-nalezy', readyTestId: 'lost-found-list-page' },
  { name: 'závady', path: '/admin/zavady', readyTestId: 'issues-list-page' },
  { name: 'sklad', path: '/admin/sklad', readyTestId: 'inventory-list-page' },
  { name: 'hlášení', path: '/admin/hlaseni', readyTestId: 'reports-list-page' },
  { name: 'uživatelé', path: '/admin/uzivatele', readyTestId: 'users-admin-page' },
  { name: 'nastavení', path: '/admin/nastaveni', readyTestId: 'settings-admin-page' },
  { name: 'profil', path: '/admin/profil', readyTestId: 'admin-profile-page' },
];

async function adminLogin(page: Page) {
  await page.goto('/admin/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/admin email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/admin heslo/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /přihlásit|prihlasit/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
}

async function waitForView(page: Page, view: ViewCheck) {
  await page.goto(view.path, { waitUntil: 'domcontentloaded' });
  if (view.readyTestId) {
    await expect(page.getByTestId(view.readyTestId)).toBeVisible();
  } else {
    await expect(page.locator('main')).toBeVisible();
  }
}

async function visibleBrandCount(page: Page): Promise<number> {
  return page.locator('[data-brand-element="true"]').evaluateAll((nodes) =>
    nodes.filter((node) => {
      const element = node as HTMLElement;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    }).length
  );
}

async function interactiveCandidates(page: Page): Promise<Locator[]> {
  const selectors = ['main .k-button:visible', 'main .k-nav-link:visible', 'main select:visible'];
  const locators: Locator[] = [];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let i = 0; i < Math.min(count, 1); i += 1) {
      locators.push(locator.nth(i));
    }
  }
  return locators;
}

async function expectElementUnobscured(locator: Locator) {
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  });
  const box = await locator.boundingBox();
  if (!box) {
    return;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const unobscured = await locator.evaluate((element, point) => {
    const hit = document.elementFromPoint(point.x, point.y);
    return Boolean(hit && (hit === element || element.contains(hit) || hit.contains(element)));
  }, { x, y });
  expect(unobscured).toBeTruthy();
}

async function assertKdgsGeometry(page: Page, viewName: string) {
  const brandCount = await visibleBrandCount(page);
  expect.soft(brandCount, `${viewName}: počet brand prvků musí být 1 až 2`).toBeGreaterThanOrEqual(1);
  expect.soft(brandCount, `${viewName}: počet brand prvků musí být 1 až 2`).toBeLessThanOrEqual(2);

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });
  expect.soft(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `${viewName}: root viewport nesmí mít horizontální overflow`
  ).toBeTruthy();
  expect.soft(
    overflow.bodyScrollWidth <= overflow.bodyClientWidth + 1,
    `${viewName}: body nesmí mít horizontální overflow`
  ).toBeTruthy();

  const candidates = await interactiveCandidates(page);
  for (const locator of candidates) {
    await expectElementUnobscured(locator);
  }
}

test.describe('KDGS vizuální a geometrická kontrola adminu', () => {
  for (const view of publicViews) {
    test(`public view ${view.name} drží brand a geometrii`, async ({ page }) => {
      await waitForView(page, view);
      await assertKdgsGeometry(page, view.name);
    });
  }

  test('autentizované admin view drží brand a geometrii', async ({ page }) => {
    await adminLogin(page);

    for (const view of adminViews) {
      await waitForView(page, view);
      await assertKdgsGeometry(page, view.name);
    }
  });
});
