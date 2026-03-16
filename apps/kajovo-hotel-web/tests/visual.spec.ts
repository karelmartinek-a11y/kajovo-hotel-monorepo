import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { getAdminCredentials } from '../test-admin-credentials';

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = getAdminCredentials();

type ViewCheck = {
  name: string;
  path: string;
  readyTestId?: string;
};

const utilityViews: ViewCheck[] = [
  { name: 'login', path: '/login', readyTestId: 'portal-login-page' },
  { name: 'intro', path: '/intro' },
  { name: 'offline', path: '/offline' },
  { name: 'maintenance', path: '/maintenance' },
  { name: '404', path: '/404' },
];

const portalViews: ViewCheck[] = [
  { name: 'recepce', path: '/recepce', readyTestId: 'reception-hub-page' },
  { name: 'snídaně', path: '/snidane', readyTestId: 'breakfast-list-page' },
  { name: 'ztráty a nálezy', path: '/ztraty-a-nalezy', readyTestId: 'lost-found-list-page' },
  { name: 'profil', path: '/profil', readyTestId: 'portal-profile-page' },
];

async function csrfHeaderFor(context: APIRequestContext) {
  const state = await context.storageState();
  const csrf = state.cookies.find((cookie: { name: string; value: string }) => cookie.name === 'kajovo_csrf')?.value;
  expect(csrf, 'Expected CSRF cookie after admin login').toBeTruthy();
  return { 'x-csrf-token': csrf! };
}

function uniqueSuffix(projectName: string, parallelIndex: number) {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${parallelIndex}-${Math.random().toString(36).slice(2, 10)}`;
  return `${projectName}-${parallelIndex}-${uuid}`;
}

async function createPortalUser(
  request: APIRequestContext,
  testInfo: { project: { name: string }; parallelIndex: number },
  roles: string[]
) {
  const adminLoginResponse = await request.post('/api/auth/admin/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(adminLoginResponse.ok()).toBeTruthy();

  const csrfHeaders = await csrfHeaderFor(request);
  const suffix = uniqueSuffix(testInfo.project.name, testInfo.parallelIndex);
  const email = `visual-${suffix}@kajovohotel.local`;
  const password = `Visual-${suffix}-pass`;

  const createUserResponse = await request.post('/api/v1/users', {
    data: {
      email,
      password,
      first_name: 'Visual',
      last_name: 'Audit',
      roles,
    },
    headers: csrfHeaders,
  });
  expect(createUserResponse.status()).toBe(201);

  return { email, password };
}

async function loginPortal(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/heslo/i).fill(password);
  await page.getByRole('button', { name: /prihlasit|přihlásit/i }).click();
  await expect(page).toHaveURL(/\/recepce$|\/$|\/role/);
  const roleSelect = page.getByTestId('role-select-page');
  if (await roleSelect.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /pokračovat jako recepce/i }).click();
    await expect(page).toHaveURL(/\/recepce$/);
  }
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
  const selectors = [
    'main button:visible',
    'main a[href]:visible',
    'main select:visible',
  ];
  const locators: Locator[] = [];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let i = 0; i < Math.min(count, 8); i += 1) {
      locators.push(locator.nth(i));
    }
  }
  return locators;
}

async function expectElementUnobscured(page: Page, locator: Locator) {
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
    await expectElementUnobscured(page, locator);
  }
}

test.describe('KDGS vizuální a geometrická kontrola portálu', () => {
  for (const view of utilityViews) {
    test(`utility view ${view.name} drží brand a geometrii`, async ({ page }) => {
      await waitForView(page, view);
      await assertKdgsGeometry(page, view.name);
    });
  }

  test('autentizované portálové view drží brand a geometrii', async ({ page, request }, testInfo) => {
    const user = await createPortalUser(request, testInfo, ['recepce']);
    await loginPortal(page, user.email, user.password);

    for (const view of portalViews) {
      await waitForView(page, view);
      await assertKdgsGeometry(page, view.name);
    }
  });
});
