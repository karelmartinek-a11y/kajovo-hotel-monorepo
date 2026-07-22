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
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const principalInput = page.locator('#portal-email');
  const passwordInput = page.locator('#portal-password');
  await principalInput.waitFor({ state: 'visible' });
  await principalInput.fill(email);
  await passwordInput.fill(password);
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

  if (await page.getByTestId('breakfast-serving-mobile-header').isVisible()) {
    return ['/snidane'];
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
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, '\\/')}$`));
  await expect(page.getByTestId('access-denied-page')).toBeVisible();
}

test('recepce načte přehled snídaní automaticky', async ({ page, request }, testInfo) => {
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

  const portalLoginResponse = await request.post('/api/auth/login', {
    data: { email: portalEmail, password: portalPassword },
  });
  expect(portalLoginResponse.ok()).toBeTruthy();
  const portalState = await request.storageState();
  await page.context().clearCookies();
  await page.context().addCookies(portalState.cookies);
  await page.goto('/recepce', { waitUntil: 'networkidle' });

  await expect(page).toHaveURL(/\/recepce$/);
  await page.getByRole('link', { name: /otevrit snidane|otevřít snídaně/i }).click();
  await expect(page).toHaveURL(/\/snidane$/);

  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
});

test('snidane umi spustit rucni aktualizaci s modalem a reloadem', async ({ page, request }, testInfo) => {
  const adminLoginResponse = await request.post('/api/auth/admin/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(adminLoginResponse.ok()).toBeTruthy();

  const csrfHeaders = await csrfHeaderFor(request);
  const suffix = uniqueSuffix(testInfo.project.name, testInfo.parallelIndex);
  const portalEmail = `web-manual-refresh-${suffix}@kajovohotel.local`;
  const portalPassword = `WebManual-${suffix}-pass`;

  const createUserResponse = await request.post('/api/v1/users', {
    data: {
      email: portalEmail,
      password: portalPassword,
      first_name: 'Ruční',
      last_name: 'Aktualizace',
      roles: ['snidane'],
    },
    headers: csrfHeaders,
  });
  expect(createUserResponse.status()).toBe(201);

  await page.route('**/api/v1/breakfast**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

    const initialOrders = [
      {
        id: 1,
        service_date: '2026-06-08',
        room_number: '101',
        guest_name: 'Původní host',
        guest_count: 1,
        note: null,
        diet_no_gluten: false,
        diet_no_milk: false,
        diet_no_pork: false,
        status: 'pending',
        created_at: '2026-06-08T07:00:00Z',
        updated_at: '2026-06-08T07:00:00Z',
      },
    ];
    const refreshedOrders = [
      ...initialOrders,
      {
        id: 2,
        service_date: '2026-06-08',
        room_number: '102',
        guest_name: 'Nový host',
        guest_count: 2,
        note: null,
        diet_no_gluten: false,
        diet_no_milk: false,
        diet_no_pork: false,
        status: 'pending',
        created_at: '2026-06-08T08:00:00Z',
        updated_at: '2026-06-08T08:00:00Z',
      },
    ];
    const currentOrders = (page as unknown as { _manualRefreshDone?: boolean })._manualRefreshDone ? refreshedOrders : initialOrders;
    const currentSummary = (page as unknown as { _manualRefreshDone?: boolean })._manualRefreshDone
      ? {
          service_date: '2026-06-08',
          total_orders: 2,
          total_guests: 3,
          status_counts: { pending: 2, preparing: 0, served: 0, cancelled: 0 },
          source_imported_at: '2026-06-08T08:05:00Z',
        }
      : {
          service_date: '2026-06-08',
          total_orders: 1,
          total_guests: 1,
          status_counts: { pending: 1, preparing: 0, served: 0, cancelled: 0 },
          source_imported_at: '2026-06-08T07:05:00Z',
        };

    if (method === 'GET' && path === '/api/v1/breakfast/daily-overview') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders: currentOrders, summary: currentSummary }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/v1/breakfast') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrders) });
      return;
    }
    if (method === 'GET' && path === '/api/v1/breakfast/daily-summary') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentSummary) });
      return;
    }
    if (method === 'POST' && path === '/api/v1/breakfast/manual-refresh') {
      (page as unknown as { _manualRefreshPolls?: number; _manualRefreshDone?: boolean })._manualRefreshPolls = 0;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          job_key: 'manual-refresh-test',
          service_date: '2026-06-08',
          status: 'queued',
          progress: [
            { at: '2026-06-08T08:00:00Z', step: 'queued', message: 'Žádost byla zařazena do fronty.' },
          ],
          message: 'Žádost byla zařazena do fronty.',
          error_message: null,
          imported_count: 0,
          created_at: '2026-06-08T08:00:00Z',
          started_at: null,
          finished_at: null,
        }),
      });
      return;
    }
    if (method === 'GET' && path === '/api/v1/breakfast/manual-refresh/1') {
      const state = page as unknown as { _manualRefreshPolls?: number; _manualRefreshDone?: boolean };
      state._manualRefreshPolls = (state._manualRefreshPolls ?? 0) + 1;
      if ((state._manualRefreshPolls ?? 0) === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 1,
            job_key: 'manual-refresh-test',
            service_date: '2026-06-08',
            status: 'running',
            progress: [
              { at: '2026-06-08T08:00:00Z', step: 'login', message: 'Přihlášení do Better Hotelu proběhlo.' },
            ],
            message: 'Přihlášení do Better Hotelu proběhlo.',
            error_message: null,
            imported_count: 0,
            created_at: '2026-06-08T08:00:00Z',
            started_at: '2026-06-08T08:00:01Z',
            finished_at: null,
          }),
        });
        return;
      }
      state._manualRefreshDone = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          job_key: 'manual-refresh-test',
          service_date: '2026-06-08',
          status: 'succeeded',
          progress: [
            { at: '2026-06-08T08:00:00Z', step: 'login', message: 'Přihlášení do Better Hotelu proběhlo.' },
            { at: '2026-06-08T08:00:02Z', step: 'download', message: 'PDF bylo staženo.' },
          ],
          message: 'Ruční import dokončen.',
          error_message: null,
          imported_count: 2,
          created_at: '2026-06-08T08:00:00Z',
          started_at: '2026-06-08T08:00:01Z',
          finished_at: '2026-06-08T08:00:04Z',
        }),
      });
      return;
    }

    await route.continue();
  });

  const portalLoginResponse = await request.post('/api/auth/login', {
    data: { email: portalEmail, password: portalPassword },
  });
  expect(portalLoginResponse.ok()).toBeTruthy();
  const portalState = await request.storageState();
  await page.context().clearCookies();
  await page.context().addCookies(portalState.cookies);
  await page.goto('/snidane', { waitUntil: 'networkidle' });

  await expect(page).toHaveURL(/\/snidane$/);
  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
  const compactServingHeader = page.getByTestId('breakfast-serving-mobile-header');
  const usesCompactServingLayout = await compactServingHeader.isVisible();
  const refreshButton = usesCompactServingLayout
    ? compactServingHeader.getByRole('button', { name: 'Aktualizovat' })
    : page.getByRole('button', { name: 'Aktualizovat z API' });
  await expect(refreshButton).toBeVisible();
  if (usesCompactServingLayout) {
    await expect(page.getByTestId('breakfast-serving-mobile-list')).toBeVisible();
    await expect(page.locator('.k-breakfast-serving-page > .k-table-wrap')).toBeHidden();
  } else {
    await expect(page.getByText(/Datum přehledu snídaní/i)).toBeVisible();
    await expect(page.locator('section').filter({ hasText: 'Snídaní celkem' }).getByRole('strong')).toHaveText('1');
    await expect(page.locator('section').filter({ hasText: 'Vydáno' }).getByRole('strong')).toHaveText('0');
    await expect(page.locator('section').filter({ hasText: 'Zbývá vydat' }).getByRole('strong')).toHaveText('1');
  }
  await expect(page.getByText(/Objednávky dne/i)).toHaveCount(0);
  await expect(page.getByText(/Hosté dne/i)).toHaveCount(0);
  await expect(page.getByText(/Pokoje /i)).toHaveCount(0);

  await refreshButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('.k-modal-progress__item').first()).toContainText('Better Hotelu');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (usesCompactServingLayout) {
    await expect(page.getByTestId('breakfast-serving-mobile-row').filter({ hasText: '102' })).toBeVisible();
  } else {
    await expect(page.getByRole('cell', { name: '102' }).first()).toBeVisible();
    await expect(page.getByText(/Data aktualizována:/i)).toBeVisible();
    await expect(page.locator('section').filter({ hasText: 'Snídaní celkem' }).getByRole('strong')).toHaveText('3');
    await expect(page.locator('section').filter({ hasText: 'Vydáno' }).getByRole('strong')).toHaveText('0');
    await expect(page.locator('section').filter({ hasText: 'Zbývá vydat' }).getByRole('strong')).toHaveText('3');
  }
});

test('portal bez session skonci na loginu', async ({ page }) => {
  await page.goto('/snidane', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('portal-login-page')).toBeVisible();
  await expect(page.locator('[data-brand-element="true"]')).toHaveCount(1);
  await expect(page).toHaveTitle(/Kájovo Hotel/);
  const brandImages = page.getByTestId('portal-login-page').locator('[data-brand-element="true"] img');
  const imageCount = await brandImages.count();
  expect(imageCount).toBeGreaterThan(0);
  for (let index = 0; index < imageCount; index += 1) {
    await expect(brandImages.nth(index)).toHaveJSProperty('complete', true);
    const naturalWidth = await brandImages.nth(index).evaluate((image) => (image as HTMLImageElement).naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  }
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
      roles: ['recepce', 'pokojska'],
    },
    headers: csrfHeaders,
  });
  expect(createUserResponse.status()).toBe(201);

  const portalLoginResponse = await request.post('/api/auth/login', {
    data: { email: portalEmail, password: portalPassword },
  });
  expect(portalLoginResponse.ok()).toBeTruthy();
  const portalState = await request.storageState();
  await page.context().clearCookies();
  await page.context().addCookies(portalState.cookies);
  await page.goto('/snidane', { waitUntil: 'networkidle' });

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
