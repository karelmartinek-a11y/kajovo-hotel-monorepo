import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getAdminCredentials } from '../../kajovo-hotel-admin/test-admin-credentials';

const { email: adminEmail, password: adminPassword } = getAdminCredentials();

type RouteCheck = {
  path: string;
  readyTestId?: string;
  heading?: RegExp;
};

type ClientIssue = {
  kind: 'console' | 'requestfailed' | 'response';
  message: string;
};

const publicRoutes: RouteCheck[] = [
  { path: '/login', readyTestId: 'portal-login-page' },
  { path: '/login/reset' },
  { path: '/admin/login', readyTestId: 'admin-login-page' },
];

const adminRoutes: RouteCheck[] = [
  { path: '/admin/', readyTestId: 'dashboard-page' },
  { path: '/admin/pokojska', readyTestId: 'housekeeping-admin-page' },
  { path: '/admin/snidane', readyTestId: 'breakfast-list-page' },
  { path: '/admin/ztraty-a-nalezy', readyTestId: 'lost-found-list-page' },
  { path: '/admin/zavady', readyTestId: 'issues-list-page' },
  { path: '/admin/sklad', readyTestId: 'inventory-list-page' },
  { path: '/admin/hlaseni', readyTestId: 'reports-list-page' },
  { path: '/admin/uzivatele', readyTestId: 'users-admin-page' },
  { path: '/admin/nastaveni', readyTestId: 'settings-admin-page' },
  { path: '/admin/profil', readyTestId: 'admin-profile-page' },
];

type TempPortalUser = {
  id: number;
  email: string;
  password: string;
};

function attachClientIssueCollector(page: Page): { issues: ClientIssue[]; reset: () => void } {
  const issues: ClientIssue[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    issues.push({ kind: 'console', message: message.text() });
  });
  page.on('requestfailed', (request) => {
    issues.push({
      kind: 'requestfailed',
      message: `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'request failed'}`,
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) {
      return;
    }
    const request = response.request();
    issues.push({
      kind: 'response',
      message: `${request.method()} ${response.url()} :: HTTP ${response.status()}`,
    });
  });
  return {
    issues,
    reset: () => {
      issues.length = 0;
    },
  };
}

function assertNoClientIssues(issues: ClientIssue[], allow: RegExp[] = []): void {
  const unexpected = issues.filter((entry) => {
    if (entry.kind === 'requestfailed' && /:: net::ERR_ABORTED$/i.test(entry.message)) {
      return false;
    }
    return !allow.some((pattern) => pattern.test(entry.message));
  });
  expect(unexpected, unexpected.map((entry) => `${entry.kind}: ${entry.message}`).join('\n')).toEqual([]);
}

async function expectReady(page: Page, route: RouteCheck): Promise<void> {
  await page.goto(route.path, { waitUntil: 'networkidle' });
  if (route.readyTestId) {
    await expect(page.getByTestId(route.readyTestId)).toBeVisible();
    return;
  }
  if (route.heading) {
    await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
    return;
  }
  await expect(page.locator('main')).toBeVisible();
}

async function loginPortal(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  throw new Error('Use loginPortalWithCredentials instead.');
}

async function loginPortalWithCredentials(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/email|uživatelské jméno/i).fill(email);
  await page.getByLabel(/heslo/i).fill(password);
  await page.getByRole('button', { name: /přihlásit|prihlasit/i }).click();
  await expect(page).not.toHaveURL(/\/login(?:\/reset)?$/);
  await expect(page.locator('main')).toBeVisible();
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/e-mail administrátora|admin email/i).fill(adminEmail);
  await page.getByLabel(/heslo administrátora|admin heslo/i).fill(adminPassword);
  await page.getByRole('button', { name: /přihlásit|prihlasit/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
}

async function csrfHeaderFor(request: APIRequestContext): Promise<Record<string, string>> {
  const state = await request.storageState();
  const csrf = state.cookies.find((cookie) => cookie.name === 'kajovo_csrf')?.value;
  expect(csrf).toBeTruthy();
  return { 'x-csrf-token': csrf! };
}

async function createTempPortalUser(request: APIRequestContext, roles: string[]): Promise<TempPortalUser> {
  const adminLogin = await request.post('/api/auth/admin/login', {
    data: { email: adminEmail, password: adminPassword },
  });
  expect(adminLogin.ok()).toBeTruthy();
  const csrfHeaders = await csrfHeaderFor(request);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Temp-${suffix}-Pass1!`;
  const email = `temp-e2e-${suffix}@kajovohotel.local`;
  const response = await request.post('/api/v1/users', {
    data: {
      email,
      password,
      first_name: 'Temp',
      last_name: 'E2E',
      roles,
    },
    headers: csrfHeaders,
  });
  expect(response.status()).toBe(201);
  const payload = await response.json() as { id: number; email: string };
  return { id: payload.id, email, password };
}

async function deleteTempPortalUser(request: APIRequestContext, userId: number): Promise<void> {
  const csrfHeaders = await csrfHeaderFor(request);
  const response = await request.delete(`/api/v1/users/${userId}`, {
    headers: csrfHeaders,
  });
  expect(response.status()).toBe(204);
}

function pragueDateOffset(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const noonUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  noonUtc.setUTCDate(noonUtc.getUTCDate() + offsetDays);
  return noonUtc.toISOString().slice(0, 10);
}

async function createTempBreakfastOrder(request: APIRequestContext, serviceDate: string, suffix: string) {
  const csrfHeaders = await csrfHeaderFor(request);
  const response = await request.post('/api/v1/breakfast', {
    data: {
      service_date: serviceDate,
      room_number: `E2E-${suffix.slice(-8)}`,
      guest_name: 'Forenzní E2E host',
      guest_count: 2,
      status: 'pending',
      note: null,
      diet_no_gluten: false,
      diet_no_milk: false,
      diet_no_pork: false,
    },
    headers: csrfHeaders,
  });
  expect(response.status()).toBe(201);
  return await response.json() as { id: number; room_number: string };
}

async function deleteTempBreakfastOrder(request: APIRequestContext, orderId: number): Promise<void> {
  const csrfHeaders = await csrfHeaderFor(request);
  const response = await request.delete(`/api/v1/breakfast/${orderId}`, { headers: csrfHeaders });
  expect(response.status()).toBe(204);
}

async function selectBreakfastDate(page: Page, serviceDate: string): Promise<void> {
  const nativePicker = page.locator('.k-date-picker-button__input').first();
  await nativePicker.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value as string);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, serviceDate);
  await page.waitForLoadState('networkidle');
}

async function expectNoViewportOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectCompactBreakfastPhoneLayout(page: Page, roomNumber: string, note: string): Promise<void> {
  const header = page.getByTestId('breakfast-serving-mobile-header');
  await expect(header).toBeVisible();
  await expect(page.getByTestId('breakfast-serving-mobile-list')).toBeVisible();
  await expect(page.locator('.k-breakfast-serving-page > .k-table-wrap')).toBeHidden();
  await expect(page.locator('.k-breakfast-serving-page > .k-toolbar')).toBeHidden();
  await expect(page.locator('.k-breakfast-serving-page > .k-breakfast-overview-date')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Předchozí den' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Následující den' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vybrat datum' })).toBeVisible();

  const mobileRow = page.getByTestId('breakfast-serving-mobile-row').filter({ hasText: roomNumber });
  await expect(mobileRow).toBeVisible();
  await expect(mobileRow.locator('.k-breakfast-serving-row__main')).toBeVisible();
  await expect(mobileRow.getByDisplayValue(note)).toBeVisible();
  await expect(mobileRow.locator('button.k-diet-toggle')).toHaveCount(0);

  const metrics = await header.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    return {
      position: styles.position,
      height: rect.height,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  expect(metrics.position).toBe('sticky');
  expect(metrics.height).toBeLessThanOrEqual(metrics.viewportHeight * 0.15);

  const rowWidth = await mobileRow.locator('.k-breakfast-serving-row__main').evaluate((element) => element.getBoundingClientRect().width);
  expect(rowWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  await expectNoViewportOverflow(page);

  const topBefore = await header.evaluate((element) => Math.round(element.getBoundingClientRect().top));
  await page.mouse.wheel(0, 500);
  const topAfter = await header.evaluate((element) => Math.round(element.getBoundingClientRect().top));
  expect(Math.abs(topAfter - topBefore)).toBeLessThanOrEqual(1);
}

async function collectNavRoutes(page: Page, testId: string): Promise<string[]> {
  const locator = page.getByTestId(testId);
  if (!(await locator.isVisible())) {
    return [];
  }
  const trigger = locator.getByRole('button').first();
  if (await trigger.isVisible()) {
    await trigger.click();
  }
  return Array.from(new Set(await locator.locator('a[href]').evaluateAll((nodes) => nodes
    .map((node) => {
      const href = node.getAttribute('href') ?? '';
      return href.startsWith('/') ? href : new URL(href, window.location.origin).pathname;
    })
    .filter((href) => href.startsWith('/'))))).sort();
}

async function maybeOpenFirstDetail(page: Page): Promise<void> {
  const detailLink = page.getByRole('link', { name: /detail/i }).first();
  if (!(await detailLink.isVisible())) {
    return;
  }
  await detailLink.click();
  await expect(page.locator('main')).toBeVisible();
}

async function maybeOpenCreateForm(page: Page): Promise<void> {
  const createLink = page.getByRole('link', { name: /nový|nová|nové/i }).first();
  if (!(await createLink.isVisible())) {
    return;
  }
  await createLink.click();
  await expect(page.locator('main')).toBeVisible();
}

test.describe('live temp production verification', () => {
  test('breakfast roles and responsive UI satisfy the production contract', async ({ page, request }, testInfo) => {
    const createdUsers: TempPortalUser[] = [];
    let order: { id: number; room_number: string } | null = null;

    const adminLogin = await request.post('/api/auth/admin/login', {
      data: { email: adminEmail, password: adminPassword },
    });
    expect(adminLogin.ok()).toBeTruthy();

    try {
      const suffix = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const serviceDate = pragueDateOffset(-2);
      const forensicNote = `Forenzní poznámka ${suffix}`;
      order = await createTempBreakfastOrder(request, serviceDate, suffix);
      const receptionUser = await createTempPortalUser(request, ['recepce']);
      const breakfastUser = await createTempPortalUser(request, ['snidane']);
      createdUsers.push(receptionUser, breakfastUser);

      await loginAdmin(page);
      await page.goto('/admin/snidane', { waitUntil: 'networkidle' });
      await selectBreakfastDate(page, serviceDate);
      await expect(page.getByText(order.room_number, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Předchozí den' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Následující den' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Vybrat datum' })).toBeVisible();
      await expect(page.getByLabel(/import pdf/i)).toHaveCount(0);
      await expect(page.getByRole('button', { name: /export snídaní|smazat den|aktualizovat z api/i })).toHaveCount(0);
      const adminRow = page.getByRole('row').filter({ hasText: order.room_number });
      await adminRow.getByRole('button', { name: 'Bez lepku' }).click();
      await expect(adminRow.getByRole('button', { name: 'Bez lepku' })).toHaveAttribute('aria-pressed', 'true');
      await adminRow.getByRole('button', { name: 'Bez mléka' }).click();
      await expect(adminRow.getByRole('button', { name: 'Bez mléka' })).toHaveAttribute('aria-pressed', 'true');
      await adminRow.getByLabel(`Poznámka pro pokoj ${order.room_number}`).fill(forensicNote);
      await adminRow.getByLabel(`Poznámka pro pokoj ${order.room_number}`).blur();
      await expect(adminRow.getByRole('button', { name: 'Vydat' })).toBeVisible();
      await adminRow.getByRole('button', { name: 'Vydat' }).click();
      await expect(adminRow.getByRole('button', { name: 'Vrátit výdej' })).toBeVisible();
      await page.reload({ waitUntil: 'networkidle' });
      const reloadedAdminRow = page.getByRole('row').filter({ hasText: order.room_number });
      await expect(reloadedAdminRow.getByRole('button', { name: 'Vrátit výdej' })).toBeVisible();
      await expectNoViewportOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`breakfast-admin-${testInfo.project.name}.png`), fullPage: true });

      await page.context().clearCookies();
      await loginPortalWithCredentials(page, receptionUser.email, receptionUser.password);
      await page.goto('/snidane', { waitUntil: 'networkidle' });
      await selectBreakfastDate(page, serviceDate);
      const receptionRow = page.getByRole('row').filter({ hasText: order.room_number });
      await expect(receptionRow).toBeVisible();
      await expect(receptionRow.getByRole('button', { name: 'Bez lepku' })).toHaveAttribute('aria-pressed', 'true');
      await receptionRow.getByRole('button', { name: 'Bez vepřového' }).click();
      await expect(receptionRow.getByRole('button', { name: 'Bez vepřového' })).toHaveAttribute('aria-pressed', 'true');
      await receptionRow.getByLabel(`Poznámka pro pokoj ${order.room_number}`).fill(`${forensicNote} · recepce`);
      await receptionRow.getByLabel(`Poznámka pro pokoj ${order.room_number}`).blur();
      await expect(receptionRow.getByRole('button', { name: 'Vrátit výdej' })).toBeVisible();
      await expectNoViewportOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`breakfast-reception-${testInfo.project.name}.png`), fullPage: true });

      await page.context().clearCookies();
      await loginPortalWithCredentials(page, breakfastUser.email, breakfastUser.password);
      await page.goto('/snidane', { waitUntil: 'networkidle' });
      await selectBreakfastDate(page, serviceDate);
      if (testInfo.project.name === 'phone') {
        await expectCompactBreakfastPhoneLayout(page, order.room_number, `${forensicNote} · recepce`);
      } else {
        const breakfastRow = page.getByRole('row').filter({ hasText: order.room_number });
        await expect(breakfastRow).toBeVisible();
        await expect(breakfastRow.getByTitle('Bezlepková strava')).toBeVisible();
        await expect(breakfastRow.getByTitle('Bezlaktozová strava')).toBeVisible();
        await expect(breakfastRow.getByTitle('Strava bez vepřového masa')).toBeVisible();
        await expect(breakfastRow.getByText(`${forensicNote} · recepce`, { exact: true })).toBeVisible();
        await expect(breakfastRow.locator('button.k-diet-toggle')).toHaveCount(0);
        await expect(breakfastRow.getByRole('button', { name: 'Vydáno' })).toBeVisible();
        await expect(breakfastRow.getByRole('button', { name: 'Vydáno' })).toBeDisabled();
        await expectNoViewportOverflow(page);
      }
      await page.screenshot({ path: testInfo.outputPath(`breakfast-user-${testInfo.project.name}.png`), fullPage: true });
    } finally {
      await request.post('/api/auth/admin/login', { data: { email: adminEmail, password: adminPassword } });
      if (order) await deleteTempBreakfastOrder(request, order.id);
      for (const user of createdUsers.reverse()) await deleteTempPortalUser(request, user.id);
    }
  });

  test('unauthenticated public and admin routes keep canonical redirects and no client errors', async ({ page }, testInfo) => {
    const collector = attachClientIssueCollector(page);

    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('portal-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.goto('/admin', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.goto('/Admin', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.goto('/Admin/login', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    if (testInfo.project.name === 'desktop') {
      for (const route of publicRoutes) {
        collector.reset();
        await expectReady(page, route);
        assertNoClientIssues(collector.issues);
      }
    }
  });

  test('portal auth flow, protected routes and visible modules stay functional', async ({ page, request }, testInfo) => {
    const collector = attachClientIssueCollector(page);
    const createdUsers: TempPortalUser[] = [];

    try {
      await page.goto('/snidane', { waitUntil: 'networkidle' });
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByTestId('portal-login-page')).toBeVisible();
      assertNoClientIssues(collector.issues);

      const invalidPortalLogin = await request.post('/api/auth/login', {
        data: {
          email: 'temp-invalid@kajovohotel.local',
          password: 'neplatne-heslo',
        },
      });
      expect([401, 423]).toContain(invalidPortalLogin.status());

      const receptionUser = await createTempPortalUser(request, ['recepce']);
      createdUsers.push(receptionUser);

      collector.reset();
      await loginPortalWithCredentials(page, receptionUser.email, receptionUser.password);
      assertNoClientIssues(collector.issues);

      collector.reset();
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.locator('main')).toBeVisible();
      assertNoClientIssues(collector.issues);

      const receptionRoutes = ['/recepce', '/snidane', '/ztraty-a-nalezy', '/hlaseni', '/profil'];
      for (const route of receptionRoutes) {
        collector.reset();
        await page.goto(route, { waitUntil: 'networkidle' });
        await expect(page.locator('main')).toBeVisible();
        await maybeOpenFirstDetail(page);
        assertNoClientIssues(collector.issues);
      }

      collector.reset();
      await page.goto('/profil', { waitUntil: 'networkidle' });
      await expect(page.getByTestId('portal-profile-page')).toBeVisible();
      await page.getByRole('button', { name: /odhlásit|odhlasit/i }).click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByTestId('portal-login-page')).toBeVisible();
      assertNoClientIssues(collector.issues);

      if (testInfo.project.name !== 'desktop') {
        return;
      }

      const housekeepingUser = await createTempPortalUser(request, ['pokojska']);
      createdUsers.push(housekeepingUser);
      collector.reset();
      await loginPortalWithCredentials(page, housekeepingUser.email, housekeepingUser.password);
      await expect(page).toHaveURL(/\/pokojska$/);
      await expect(page.getByTestId('housekeeping-form-page')).toBeVisible();
      assertNoClientIssues(collector.issues);
      await page.goto('/profil', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /odhlásit|odhlasit/i }).click();

      const maintenanceUser = await createTempPortalUser(request, ['udrzba']);
      createdUsers.push(maintenanceUser);
      collector.reset();
      await loginPortalWithCredentials(page, maintenanceUser.email, maintenanceUser.password);
      await expect(page).toHaveURL(/\/zavady$/);
      await expect(page.getByTestId('issues-list-page')).toBeVisible();
      await maybeOpenFirstDetail(page);
      assertNoClientIssues(collector.issues);
      await page.goto('/profil', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /odhlásit|odhlasit/i }).click();

      const stockUser = await createTempPortalUser(request, ['sklad']);
      createdUsers.push(stockUser);
      collector.reset();
      await loginPortalWithCredentials(page, stockUser.email, stockUser.password);
      await expect(page).toHaveURL(/\/sklad$/);
      await expect(page.getByTestId('inventory-list-page')).toBeVisible();
      await maybeOpenFirstDetail(page);
      assertNoClientIssues(collector.issues);
    } finally {
      for (const user of createdUsers.reverse()) {
        await deleteTempPortalUser(request, user.id);
      }
    }
  });

  test('admin auth flow, route inventory and logout stay functional', async ({ page, request }, testInfo) => {
    const collector = attachClientIssueCollector(page);

    await page.goto('/admin/uzivatele', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    collector.reset();
    const invalidAdminLogin = await request.post('/api/auth/admin/login', {
      data: {
        email: 'temp-invalid-admin@kajovohotel.local',
        password: 'neplatne-heslo',
      },
    });
    expect([401, 423]).toContain(invalidAdminLogin.status());
    assertNoClientIssues(collector.issues);

    collector.reset();
    await loginAdmin(page);
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    if (testInfo.project.name !== 'desktop') {
      return;
    }

    for (const route of adminRoutes) {
      collector.reset();
      await expectReady(page, route);
      await maybeOpenFirstDetail(page);
      if (/\/admin\/(snidane|ztraty-a-nalezy|zavady|sklad|hlaseni)$/.test(route.path)) {
        await page.goto(route.path, { waitUntil: 'networkidle' });
        await maybeOpenCreateForm(page);
      }
      assertNoClientIssues(collector.issues);
    }

    collector.reset();
    await page.goto('/admin/profil', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('admin-profile-page')).toBeVisible();
    await page.getByRole('button', { name: /odhlásit|odhlasit/i }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);
  });

  test('live API endpoints used by browser surfaces stay healthy', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();

    const portalMe = await request.get('/api/auth/me');
    expect([200, 401]).toContain(portalMe.status());
  });
});
