import { expect, test, type APIRequestContext } from '@playwright/test';
import { getAdminCredentials } from '../test-admin-credentials';

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = getAdminCredentials();
const MODULE_ROOTS = ['/recepce', '/pokojska', '/snidane', '/ztraty-a-nalezy', '/zavady', '/sklad', '/hlaseni'] as const;

type RoleScenario = {
  key: string;
  apiRole: string;
  startRoute: string;
  visibleModules: string[];
  allowedRoutes: string[];
  deniedRoutes: string[];
};

const ROLE_SCENARIOS: RoleScenario[] = [
  {
    key: 'recepce',
    apiRole: 'recepce',
    startRoute: '/recepce',
    visibleModules: ['/snidane', '/ztraty-a-nalezy', '/hlaseni'],
    allowedRoutes: ['/recepce', '/snidane', '/ztraty-a-nalezy', '/hlaseni'],
    deniedRoutes: ['/pokojska', '/zavady', '/sklad'],
  },
  {
    key: 'pokojská',
    apiRole: 'pokojska',
    startRoute: '/pokojska',
    visibleModules: ['/pokojska'],
    allowedRoutes: ['/pokojska'],
    deniedRoutes: ['/snidane', '/ztraty-a-nalezy', '/zavady', '/sklad', '/hlaseni'],
  },
  {
    key: 'údržba',
    apiRole: 'udrzba',
    startRoute: '/zavady',
    visibleModules: ['/zavady'],
    allowedRoutes: ['/zavady'],
    deniedRoutes: ['/pokojska', '/snidane', '/ztraty-a-nalezy', '/sklad', '/hlaseni'],
  },
  {
    key: 'snídaně',
    apiRole: 'snidane',
    startRoute: '/snidane',
    visibleModules: ['/snidane'],
    allowedRoutes: ['/snidane'],
    deniedRoutes: ['/pokojska', '/ztraty-a-nalezy', '/zavady', '/sklad', '/hlaseni'],
  },
  {
    key: 'sklad',
    apiRole: 'sklad',
    startRoute: '/sklad',
    visibleModules: ['/sklad', '/hlaseni'],
    allowedRoutes: ['/sklad', '/hlaseni'],
    deniedRoutes: ['/pokojska', '/snidane', '/ztraty-a-nalezy', '/zavady'],
  },
];

const ROUTE_TEST_IDS: Record<string, string> = {
  '/recepce': 'reception-hub-page',
  '/pokojska': 'housekeeping-form-page',
  '/snidane': 'breakfast-list-page',
  '/ztraty-a-nalezy': 'lost-found-list-page',
  '/zavady': 'issues-list-page',
  '/sklad': 'inventory-list-page',
  '/hlaseni': 'reports-list-page',
};

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

async function createPortalUserForRole(
  request: APIRequestContext,
  testInfo: { project: { name: string }; parallelIndex: number },
  role: string,
) {
  const adminLoginResponse = await request.post('/api/auth/admin/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(adminLoginResponse.ok()).toBeTruthy();

  const csrfHeaders = await csrfHeaderFor(request);
  const suffix = uniqueSuffix(testInfo.project.name, testInfo.parallelIndex);
  const portalEmail = `rbac-${role}-${suffix}@kajovohotel.local`;
  const portalPassword = `Rbac-${suffix}-pass`;

  const createUserResponse = await request.post('/api/v1/users', {
    data: {
      email: portalEmail,
      password: portalPassword,
      first_name: 'RBAC',
      last_name: role,
      roles: [role],
    },
    headers: csrfHeaders,
  });
  expect(createUserResponse.status()).toBe(201);

  return { portalEmail, portalPassword };
}

async function loginPortalUser(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/heslo/i).fill(password);
  await page.getByRole('button', { name: /prihlasit|přihlásit/i }).click();
}

async function collectVisibleModuleRoutes(page: import('@playwright/test').Page) {
  const phoneNavigation = page.getByTestId('module-navigation-phone');
  if (await phoneNavigation.isVisible()) {
    await phoneNavigation.getByRole('button').click();
    return Array.from(new Set(await phoneNavigation.locator('a[href]').evaluateAll((links) =>
      links.map((link) => {
        const href = link.getAttribute('href') ?? '';
        return href.startsWith('/') ? href : new URL(href, window.location.origin).pathname;
      }),
    ))).sort();
  }

  const desktopNavigation = page.getByTestId('module-navigation-desktop');
  const overflowButton = desktopNavigation.getByRole('button');
  if (await overflowButton.isVisible()) {
    await overflowButton.click();
  }
  return Array.from(new Set(await desktopNavigation.locator('a[href]').evaluateAll((links) =>
    links.map((link) => {
      const href = link.getAttribute('href') ?? '';
      return href.startsWith('/') ? href : new URL(href, window.location.origin).pathname;
    }),
  ))).sort();
}

async function expectAllowedRoute(page: import('@playwright/test').Page, route: string) {
  await page.goto(route, { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, '\\/')}$`));
  await expect(page.getByTestId(ROUTE_TEST_IDS[route])).toBeVisible();
  await expect(page.getByTestId('access-denied-page')).toHaveCount(0);
}

async function expectDeniedRoute(page: import('@playwright/test').Page, route: string) {
  await page.goto(route, { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, '\\/')}$`));
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
}

test('recepce vidi po nahrani PDF nahled importu snidani', async ({ page, request }, testInfo) => {
  const adminLoginResponse = await request.post('/api/auth/admin/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(adminLoginResponse.ok()).toBeTruthy();

  const csrfHeaders = await csrfHeaderFor(request);
  const suffix = uniqueSuffix(testInfo.project.name, testInfo.parallelIndex);
  const portalEmail = `web-breakfast-${suffix}@kajovohotel.local`;
  const portalPassword = `WebBreakfast-${suffix}-pass`;

  const createUserResponse = await request.post('/api/v1/users', {
    data: {
      email: portalEmail,
      password: portalPassword,
      first_name: 'Recepce',
      last_name: 'Import',
      roles: ['recepce'],
    },
    headers: csrfHeaders,
  });
  expect(createUserResponse.status()).toBe(201);

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/email/i).fill(portalEmail);
  await page.getByLabel(/heslo/i).fill(portalPassword);
  await page.getByRole('button', { name: /prihlasit|přihlásit/i }).click();

  await expect(page).toHaveURL(/\/recepce$/);
  await page.getByRole('link', { name: /otevrit snidane|otevřít snídaně/i }).click();
  await expect(page).toHaveURL(/\/snidane$/);

  const samplePdfPath = `${testInfo.config.rootDir}/../../../docs/breakfast/breakfast-sample.pdf`;
  await page.getByLabel(/import pdf/i).setInputFiles(samplePdfPath);

  await expect(page.getByText(/kontrola importu/i)).toBeVisible();
  await expect(page.getByRole('cell', { name: '101' }).first()).toBeVisible();
});

test('portal bez session skonci na loginu', async ({ page }) => {
  await page.goto('/snidane', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('portal-login-page')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Stáhnout APK' })).toHaveAttribute('href', '/downloads/kajovo-hotel-android.apk');
});

test('portal auth endpoint funguje nad realnym API a web admin surface zustava retired', async ({ page, request }, testInfo) => {
  const adminLoginResponse = await request.post('/api/auth/admin/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(adminLoginResponse.ok()).toBeTruthy();

  const csrfHeaders = await csrfHeaderFor(request);
  const suffix = uniqueSuffix(testInfo.project.name, testInfo.parallelIndex);
  const portalEmail = `web-live-${suffix}@kajovohotel.local`;
  const portalPassword = `WebLive-${suffix}-pass`;

  const createUserResponse = await request.post('/api/v1/users', {
    data: {
      email: portalEmail,
      password: portalPassword,
      first_name: 'Web',
      last_name: 'Smoke',
      roles: ['recepce'],
    },
    headers: csrfHeaders,
  });
  expect(createUserResponse.status()).toBe(201);

  const portalLoginResponse = await request.post('/api/auth/login', {
    data: { email: portalEmail, password: portalPassword },
  });
  expect(portalLoginResponse.ok()).toBeTruthy();
  await expect(portalLoginResponse.json()).resolves.toMatchObject({
    email: portalEmail,
    actor_type: 'portal',
  });

  await page.goto('/admin/uzivatele', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
});

test('multirolni portal uzivatel vidi po vyberu role prepinac ostatnich roli v zahlavi', async ({ page, request }, testInfo) => {
  const adminLoginResponse = await request.post('/api/auth/admin/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(adminLoginResponse.ok()).toBeTruthy();

  const csrfHeaders = await csrfHeaderFor(request);
  const suffix = uniqueSuffix(testInfo.project.name, testInfo.parallelIndex);
  const portalEmail = `web-multirole-${suffix}@kajovohotel.local`;
  const portalPassword = `WebMulti-${suffix}-pass`;

  const createUserResponse = await request.post('/api/v1/users', {
    data: {
      email: portalEmail,
      password: portalPassword,
      first_name: 'Multi',
      last_name: 'Role',
      roles: ['recepce', 'pokojská'],
    },
    headers: csrfHeaders,
  });
  expect(createUserResponse.status()).toBe(201);

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/email/i).fill(portalEmail);
  await page.getByLabel(/heslo/i).fill(portalPassword);
  await page.getByRole('button', { name: /prihlasit|přihlásit/i }).click();

  await expect(page.getByTestId('role-select-page')).toBeVisible();
  await page.getByRole('button', { name: /pokračovat jako pokojská/i }).click();

  await expect(page).toHaveURL(/\/pokojska$/);
  await expect(page.locator('.k-role-switcher__active')).toHaveText(/pokojská/i);
  await expect(page.getByRole('button', { name: /recepce/i })).toBeVisible();
});

test('portal uzivatel s rolemi pokojska a snidane se umi z pokojske prepnout na snidane', async ({ page, request }, testInfo) => {
  const adminLoginResponse = await request.post('/api/auth/admin/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(adminLoginResponse.ok()).toBeTruthy();

  const csrfHeaders = await csrfHeaderFor(request);
  const suffix = uniqueSuffix(testInfo.project.name, testInfo.parallelIndex);
  const portalEmail = `web-hk-breakfast-${suffix}@kajovohotel.local`;
  const portalPassword = `WebHkBreakfast-${suffix}-pass`;

  const createUserResponse = await request.post('/api/v1/users', {
    data: {
      email: portalEmail,
      password: portalPassword,
      first_name: 'Pokoj',
      last_name: 'Snidane',
      roles: ['pokojska', 'snidane'],
    },
    headers: csrfHeaders,
  });
  expect(createUserResponse.status()).toBe(201);

  await loginPortalUser(page, portalEmail, portalPassword);

  await expect(page.getByTestId('role-select-page')).toBeVisible();
  await page.getByTestId('role-select-page').getByRole('button').first().click();

  await expect(page).toHaveURL(/\/pokojska$/);
  await expect(page.locator('.k-role-switcher__active')).toHaveText(/pokojská/i);
  await page.locator('.k-role-switcher__button').first().click();

  await expect(page).toHaveURL(/\/snidane$/);
  await expect(page.locator('.k-role-switcher__active')).toHaveText(/snídaně/i);
  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
});

for (const scenario of ROLE_SCENARIOS) {
  test(`RBAC matice pro roli ${scenario.key} zobrazi jen povolene moduly a odmitne zakazane route`, async ({ page, request }, testInfo) => {
    const { portalEmail, portalPassword } = await createPortalUserForRole(request, testInfo, scenario.apiRole);

    await loginPortalUser(page, portalEmail, portalPassword);
    await expect(page).toHaveURL(new RegExp(`${scenario.startRoute.replace(/\//g, '\\/')}$`));
    await expect(page.getByTestId(ROUTE_TEST_IDS[scenario.startRoute])).toBeVisible();

    const expectedVisibleModules = scenario.visibleModules.filter((route) => MODULE_ROOTS.includes(route as typeof MODULE_ROOTS[number]));
    const visibleModuleRoutes = await collectVisibleModuleRoutes(page);
    expect(visibleModuleRoutes).toEqual(expectedVisibleModules.slice().sort());

    for (const route of scenario.allowedRoutes) {
      await expectAllowedRoute(page, route);
    }

    await page.goto('/recepce', { waitUntil: 'networkidle' });
    if (scenario.startRoute === '/recepce') {
      await expect(page.getByTestId('reception-hub-page')).toBeVisible();
    } else {
      await expect(page).toHaveURL(new RegExp(`${scenario.startRoute.replace(/\//g, '\\/')}$`));
      await expect(page.getByTestId(ROUTE_TEST_IDS[scenario.startRoute])).toBeVisible();
    }

    for (const route of scenario.deniedRoutes) {
      await expectDeniedRoute(page, route);
    }
  });
}
