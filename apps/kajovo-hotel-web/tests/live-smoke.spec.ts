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
    visibleModules: ['/pokojska', '/recepce', '/snidane', '/ztraty-a-nalezy', '/hlaseni'],
    allowedRoutes: ['/recepce', '/pokojska', '/snidane', '/ztraty-a-nalezy', '/hlaseni'],
    deniedRoutes: ['/zavady', '/sklad'],
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

const HOUSEKEEPING_ROOM_FIXTURE = {
  room_id: 'room-101',
  room_number: '101',
  room_name: '101 KOMFORT',
  floor: '1',
  housekeeping_status_id: 'dirty-id',
  housekeeping_status: 'Neuklizeno',
  housekeeping_status_key: 'dirty',
  housekeeping_color: '#F57621',
  operational_state: 'checkout_departed_dirty',
  occupancy_state: 'free',
  departures: [{ reservation_id: 'reservation-old', guest_label: 'Novákovi', display_name: 'Novákovi', adults: 2, children: 0, infants: 0, dog_count: 0, cot_required: false, reservation_state: 'checked_out', persons: 2, country_name: 'Česko', country_code: 'CZ', country_code_alpha3: 'CZE', arrival: '2026-09-15', departure: '2026-09-17', checked_in: '2026-09-15T14:00:00Z', checked_out: '2026-09-17T10:00:00Z', amenities: [] }],
  arrivals: [],
  stays: [],
  arrival_today: false,
  departure_today: true,
  checked_out: true,
  occupied: false,
  guest_label: 'Novákovi',
  persons: 2,
} as const;

const HOUSEKEEPING_ROOM_FIXTURES = [
  HOUSEKEEPING_ROOM_FIXTURE,
  ...[201, 202, 203, 204, 205, 206, 207, 208, 301, 302, 303, 304, 305, 306, 307, 308].map((number, index) => ({
    ...HOUSEKEEPING_ROOM_FIXTURE,
    room_id: `room-${number}`,
    room_number: String(number),
    room_name: `${number} KOMFORT`,
    floor: String(number)[0],
    guest_label: index % 3 === 0 ? 'Svoboda' : index % 3 === 1 ? 'D. Král' : null,
    persons: index % 3,
    operational_state: index % 5 === 0 ? 'checkout_departed_clean' : index % 5 === 1 ? 'checkout_pending' : index % 5 === 2 ? 'occupied' : 'free',
    arrival_today: index % 4 === 0,
    departure_today: index % 5 < 2,
    checked_out: index % 5 === 0,
    occupied: index % 5 === 2,
  })),
];

const EXPECTED_ROOM_ORDER = [
  101, 102, 103, 104, 105, 106, 107, 108,
  109, 203, 204, 205, 206, 207, 208, 301,
  302, 303, 304, 305, 306, 307, 308, 309,
  310, 221, 222, 223, 224, 321, 322, 323,
  324, 201, 202, 209, 210,
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
  const loginResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /prihlasit|přihlásit/i }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.waitForURL((url) => url.pathname !== '/login');
  await page.waitForLoadState('networkidle');
}

test('po návratu na neověřený pohled přihlášení obnoví původní cestu', async ({ page, request }, testInfo) => {
  const user = await createPortalUserForRole(request, testInfo, 'snidane');
  await page.context().clearCookies();
  await page.goto('/snidane');
  await expect(page).toHaveURL(/\/login\?next=%2Fsnidane$/);
  await page.locator('#portal-email').fill(user.portalEmail);
  await page.locator('#portal-password').fill(user.portalPassword);
  await page.getByRole('button', { name: /prihlasit|přihlásit/i }).click();
  await expect(page).toHaveURL(/\/snidane$/);
  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
});

async function collectVisibleModuleRoutes(page: import('@playwright/test').Page) {
  const mobileTabs = page.getByTestId('portal-mobile-tabs');
  return Array.from(new Set(await mobileTabs.locator('a[href]:not([href="/profil"])').evaluateAll((links) =>
    links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
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

test('pokoje oddělují stav pokoje od rezervací a počítají noci', async ({ page, request }, testInfo) => {
  let checkedOut = false;
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('include_options')).toBe('true');
    const date = url.searchParams.get('date')!;
    const newYear = date === '2027-01-01';
    const stay = { ...HOUSEKEEPING_ROOM_FIXTURE.departures[0], reservation_state: checkedOut ? 'checked_out' : 'checked_in', departure_time: '10:15', arrival: newYear ? '2026-12-30' : '2026-03-28', departure: date };
    const arrival = { ...stay, reservation_id: 'new', display_name: 'Příjezdový host', reservation_state: 'confirmed', arrival_time: null, arrival: date, departure: newYear ? '2027-01-02' : '2026-03-31' };
    await route.fulfill({ json: { date, occupancy_date: '2026-09-18', housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [
      { ...HOUSEKEEPING_ROOM_FIXTURE, departures: [stay], arrivals: [arrival] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '102', room_number: '102', departures: [], arrivals: [arrival] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '103', room_number: '103', departures: [stay], arrivals: [] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '104', room_number: '104', departures: [], arrivals: [], stays: [{ ...stay, reservation_state: 'option', departure: '2026-04-01' }] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '105', room_number: '105', housekeeping_status_key: 'clean', departures: [], arrivals: [], stays: [] },
    ] } });
  });
  const user = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  await page.getByLabel('Vybraný den', { exact: true }).fill('2026-03-30');
  const card = page.getByRole('button', { name: /pokoj 101,/i });
  await expect(card.locator('.k-hk-room__topline')).toHaveClass(/k-hk-room-status--dirty/);
  await expect(card.locator('[data-stay-kind="departure"]')).toHaveClass(/k-hk-reservation--checked_in/);
  await expect(card.locator('[data-stay-kind="arrival"]')).toHaveClass(/k-hk-reservation--confirmed/);
  await expect(card.locator('[data-stay-kind="departure"]')).toContainText('10:15');
  await expect(card.locator('[data-stay-kind="arrival"] .k-hk-reservation__time')).toHaveText('?');
  await card.click();
  const detail = page.getByRole('dialog');
  await expect(detail.locator('.k-hk-status-actions button')).toHaveCount(8);
  expect(await detail.locator('.k-hk-status-actions').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(await detail.locator('.k-hk-detail-stays').evaluate((el) => el.getBoundingClientRect().top));
  await expect(detail.locator('dd').filter({ hasText: /^2\/2$/ })).toHaveCount(1);
  await expect(detail.locator('dd').filter({ hasText: /^0\/1$/ })).toHaveCount(1);
  await detail.getByRole('button', { name: 'Zavřít dialog' }).click();
  await expect(page.getByRole('button', { name: /pokoj 102,/i }).locator('.k-hk-room__slot').first().locator('.k-hk-reservation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /pokoj 103,/i }).locator('.k-hk-room__slot').last().locator('.k-hk-reservation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /pokoj 104,/i }).locator('.k-hk-room__slot--full .k-hk-reservation')).toHaveClass(/--option/);
  const empty = page.getByRole('button', { name: /pokoj 105,/i });
  await expect(empty.locator('.k-hk-reservation')).toHaveCount(0);
  await expect(empty.locator('.k-hk-room__slot')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  checkedOut = true;
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect(card.locator('[data-stay-kind="departure"]')).toHaveClass(/--checked_out/);
  await expect(card.locator('[data-stay-kind="arrival"]')).toHaveClass(/--confirmed/);
  await expect(page.getByLabel('Vybraný den', { exact: true })).toHaveValue('2026-03-30');
  await page.getByLabel('Vybraný den', { exact: true }).fill('2027-01-01');
  await card.click();
  await expect(page.getByRole('dialog').locator('dd').filter({ hasText: /^2\/2$/ })).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Zavřít dialog' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('pokoje zachovají provozní pořadí a přizpůsobí mřížku šířce okna', async ({ page, request }, testInfo) => {
  const rooms = [410, 99, ...EXPECTED_ROOM_ORDER.slice().reverse()].map((number) => ({
    ...HOUSEKEEPING_ROOM_FIXTURE, floor: String(number)[0], room_id: `room-${number}`, room_number: String(number),
  }));
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date')!;
    await route.fulfill({ json: { date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms } });
  });
  const user = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  const firstCard = page.locator('.k-hk-room').first();
  await expect(firstCard).toBeVisible();
  await expect(page.locator('.k-hk-room')).toHaveCount(39);
  expect(await page.locator('.k-hk-room').evaluateAll((nodes) => nodes.map((node) => node.querySelector('.k-hk-room__topline strong')?.textContent))).toEqual([...EXPECTED_ROOM_ORDER, 99, 410].map(String));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await firstCard.scrollIntoViewIfNeeded();
    await expect.poll(() => firstCard.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(width);
    await expect.poll(() => page.locator('.k-hk-board').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(width);
    if (width === 390) {
      const rows = await page.locator('.k-hk-room').evaluateAll((nodes) => nodes.slice(0, 8).map((node) => node.getBoundingClientRect().top));
      expect(rows.slice(0, 4).every((top) => Math.abs(top - rows[0]) < 2)).toBeTruthy();
      expect(rows.slice(4).every((top) => Math.abs(top - rows[4]) < 2)).toBeTruthy();
      expect(rows[4]).toBeGreaterThan(rows[0]);
    }
  }
});

test('pokojská používá jediné obrázkové zápatí pro pokoje, nález a závadu', async ({ page, request }, testInfo) => {
  const submitted: Array<{ kind: string; body: Record<string, unknown> }> = [];
  for (const [kind, path] of [['lost_found', 'lost-found'], ['issue', 'issues']] as const) {
    await page.route(`**/api/v1/${path}`, async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      submitted.push({ kind, body: route.request().postDataJSON() });
      await route.fulfill({ status: 201, json: { id: submitted.length } });
    });
  }
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date')!;
    await route.fulfill({ json: { date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [HOUSEKEEPING_ROOM_FIXTURE] } });
  });
  const user = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  await page.setViewportSize({ width: 390, height: 844 });
  const footer = page.getByTestId('portal-mobile-tabs');
  await expect(footer).toBeVisible();
  await expect(page.locator('.k-housekeeping-toggle')).toHaveCount(0);
  await expect(footer.locator('a, button')).toHaveCount(5);
  for (const [label, view, kind] of [['Nález', 'lost_found', 'lost_found'], ['Závada', 'issue', 'issue']] as const) {
    await footer.getByRole('link', { name: label }).click();
    expect(new URL(page.url()).pathname).toBe('/pokojska');
    expect(new URL(page.url()).searchParams.get('view')).toBe(view);
    await expect(footer.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#housekeeping_description')).toBeVisible();
    await page.getByRole('button', { name: '101', exact: true }).click();
    await page.locator('#housekeeping_description').fill(`Test ${label}`);
    await page.getByRole('button', { name: 'Odeslat' }).click();
    await expect(page.getByText(/Úspěšně byl odeslán záznam/)).toBeVisible();
    expect(submitted[submitted.length - 1]?.kind).toBe(kind);
    expect(submitted[submitted.length - 1]?.body.room_number).toBe('101');
  }
  await footer.getByRole('link', { name: 'Pokoje' }).click();
  await expect(page).toHaveURL(/\/pokojska$/);
  await expect(page.getByTestId('housekeeping-rooms-view')).toBeVisible();
});

test('snídaně mění jedinou dietu konkrétní rezervace a obnoví přehled', async ({ page, request }, testInfo) => {
  const reservations = ['a', 'b'].map((id) => ({ reservation_id: id, guest_name: `Host ${id}`, arrival: '2026-09-15', departure: '2026-09-19', diet_no_gluten: false, diet_no_milk: false, diet_no_pork: false, version: 1 }));
  const writes: unknown[] = [];
  await page.route('**/api/v1/breakfast/900/reservations/*/diet', async (route) => {
    const payload = route.request().postDataJSON();
    writes.push(payload);
    const target = reservations.find((item) => route.request().url().includes(`/reservations/${item.reservation_id}/`))!;
    expect(payload.version).toBe(target.version);
    expect(payload.kind).toBe('diet_no_milk');
    target.diet_no_milk = payload.enabled;
    target.version += 1;
    await route.fulfill({ json: { id: 900, reservations } });
  });
  await page.route('**/api/v1/breakfast/daily-overview?*', async (route) => {
    const day = new URL(route.request().url()).searchParams.get('service_date');
    await route.fulfill({ json: { orders: [{ id: 900, service_date: day, room_number: '101', guest_name: 'Host a; Host b', guest_count: 2, status: 'pending', note: null, created_at: null, updated_at: null, reservations }], summary: { service_date: day, total_orders: 1, total_guests: 2, status_counts: { pending: 1 } } } });
  });
  const user = await createPortalUserForRole(request, testInfo, 'recepce');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  await expect(page).toHaveURL(/\/recepce$/);
  await page.goto('/snidane');
  await expect(page.locator('.k-breakfast-reservation-diets')).toHaveCount(4);
  if (await page.getByTestId('breakfast-serving-mobile-list').isVisible()) await page.getByText('Diety pobytu', { exact: true }).click();
  const stay = page.locator('.k-breakfast-reservation-diets:visible').filter({ hasText: 'Host a' });
  await stay.getByRole('button', { name: 'Bez laktózy', exact: true }).click();
  await expect(stay.getByRole('button', { name: 'Bez laktózy', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.k-breakfast-reservation-diets:visible').filter({ hasText: 'Host b' }).getByRole('button', { name: 'Bez laktózy', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await stay.getByRole('button', { name: 'Bez laktózy', exact: true }).click();
  await expect(stay.getByRole('button', { name: 'Bez laktózy', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(writes).toEqual([{ kind: 'diet_no_milk', enabled: true, version: 1 }, { kind: 'diet_no_milk', enabled: false, version: 2 }]);
});

test('pokojská načte pokoje a změní stav pokoje na uklizeno', async ({ page, request }, testInfo) => {
  let patchBody: unknown = null;
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    if (route.request().method() === 'PATCH') {
      patchBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...HOUSEKEEPING_ROOM_FIXTURE,
          housekeeping_status_id: 'clean-id',
          housekeeping_status: 'Uklizeno pro nájezd',
          housekeeping_status_key: 'clean',
          housekeeping_color: '#138B43',
          operational_state: 'checkout_departed_clean',
        }),
      });
      return;
    }
    const selectedDate = new URL(route.request().url()).searchParams.get('date');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        date: selectedDate,
        occupancy_date: selectedDate,
        housekeeping_status_is_current: true,
        loaded_at: '2026-09-17T12:00:00Z',
        rooms: HOUSEKEEPING_ROOM_FIXTURES.map((room) => room.room_id === 'room-101' && patchBody ? { ...room, housekeeping_status_key: 'clean', housekeeping_status: 'Uklizeno pro nájezd', operational_state: 'checkout_departed_clean' } : room),
      }),
    });
  });
  const { portalEmail, portalPassword } = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, portalEmail, portalPassword);
  await expect(page).toHaveURL(/\/pokojska$/);
  await expect(page.getByTestId('housekeeping-rooms-view')).toBeVisible();
  await page.getByRole('button', { name: /pokoj 101,/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Neuklizeno');
  await dialog.getByRole('button', { name: /^Uklizeno /i }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /pokoj 101/i }).locator('.k-hk-room__topline')).toHaveClass(/--clean/);
  expect(patchBody).toEqual({ status: 'clean', expected_status: 'dirty' });
});

test('pokoje obnovují vybraný den po minutě a po návratu z pozadí', async ({ page, request }, testInfo) => {
  await page.clock.install();
  const dates: string[] = [];
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date')!;
    dates.push(date);
    await route.fulfill({ json: { date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [HOUSEKEEPING_ROOM_FIXTURE] } });
  });
  const user = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  await expect(page.getByRole('button', { name: /pokoj 101/i })).toBeVisible();
  await page.getByRole('button', { name: 'Předchozí den' }).click();
  await expect(page.getByRole('button', { name: /pokoj 101/i })).toBeVisible();
  const chosenDate = dates[dates.length - 1];
  const before = dates.length;
  await page.clock.fastForward(59_000);
  expect(dates.length).toBe(before);
  await page.clock.fastForward(1_000);
  await expect.poll(() => dates.length).toBeGreaterThan(before);
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: true }));
  const hiddenCount = dates.length;
  await page.clock.fastForward(120_000);
  expect(dates.length).toBe(hiddenCount);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => dates.length).toBeGreaterThan(hiddenCount);
  const visibleCount = dates.length;
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect.poll(() => dates.length).toBeGreaterThan(visibleCount);
  expect(dates.slice(before).every((date) => date === chosenDate)).toBe(true);
});

test('pokoj s poznámkou pokojské upozorní ikonou a ukáže text v detailu', async ({ page, request }, testInfo) => {
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date');
    await route.fulfill({ json: { date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [{ ...HOUSEKEEPING_ROOM_FIXTURE,
      departures: [{ ...HOUSEKEEPING_ROOM_FIXTURE.departures[0], housekeeping_note: 'Prosím druhý polštář' }],
    }] } });
  });
  const user = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  const card = page.getByRole('button', { name: /pokoj 101/i });
  await expect(card.locator('.k-hk-room__note-alert')).toBeVisible();
  await card.click();
  await expect(page.getByRole('dialog')).toContainText('Prosím druhý polštář');
});

test('pokoje nepřepíše opožděná odpověď předchozího dne', async ({ page, request }, testInfo) => {
  let held: import('@playwright/test').Route | undefined;
  let count = 0;
  const response = (date: string, label: string) => ({ date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [{ ...HOUSEKEEPING_ROOM_FIXTURE, departures: [{ ...HOUSEKEEPING_ROOM_FIXTURE.departures[0], guest_label: label, display_name: label, country_code_alpha3: label === 'První den' ? 'CZE' : label === 'Nový den' ? 'DEU' : 'AUT' }] }] });
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    count += 1;
    if (count === 2) { held = route; return; }
    await route.fulfill({ json: response(new URL(route.request().url()).searchParams.get('date')!, count === 1 ? 'První den' : 'Nový den') });
  });
  const user = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  await expect(page.getByRole('button', { name: /pokoj 101/i })).toContainText('CZE');
  await page.getByRole('button', { name: 'Předchozí den' }).click();
  await expect.poll(() => Boolean(held)).toBe(true);
  await page.getByRole('button', { name: 'Předchozí den' }).click();
  await expect(page.getByRole('button', { name: /pokoj 101/i })).toContainText('DEU');
  await held!.fulfill({ json: response(new URL(held!.request().url()).searchParams.get('date')!, 'Starý den') });
  await expect(page.getByRole('button', { name: /pokoj 101/i })).toContainText('DEU');
});

for (const role of ['recepce', 'pokojska']) {
  test(`pokoje zobrazí automatické požadavky bez ruční správy: ${role}`, async ({ page, request }, testInfo) => {
    const mutations: string[] = [];
    await page.route('**/api/v1/housekeeping/reservations/**', async (route) => { mutations.push(route.request().method()); await route.abort(); });
    await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
      const date = new URL(route.request().url()).searchParams.get('date');
      await route.fulfill({ json: { date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [{ ...HOUSEKEEPING_ROOM_FIXTURE,
        arrivals: [{ ...HOUSEKEEPING_ROOM_FIXTURE.departures[0], reservation_id: 'new', display_name: 'Přijíždějící host', reservation_state: 'confirmed', dog_count: 2, cot_required: true, housekeeping_note: 'Dvě postýlky prosím' }],
      }] } });
    });
    const user = await createPortalUserForRole(request, testInfo, role);
    await loginPortalUser(page, user.portalEmail, user.portalPassword);
    if (role === 'recepce') await page.goto('/pokojska');
    const card = page.getByRole('button', { name: /pokoj 101/i });
    await expect(card.locator('[data-stay-kind="arrival"] .k-hk-request-icon')).toHaveCount(3);
    await expect(card.locator('[data-stay-kind="departure"] .k-hk-request-icon')).toHaveCount(0);
    await card.click();
    const detail = page.getByRole('dialog');
    await expect(detail).toContainText('Dvě postýlky prosím');
    await expect(detail.getByRole('button', { name: /Přidat:|Odebrat:|Čeká →|Pobyty a ikony/ })).toHaveCount(0);
    expect(mutations).toEqual([]);
  });
}

test('snidane maji jedinou navigaci data a obnovuji se pri navratu do okna', async ({ page, request }, testInfo) => {
  const adminLoginResponse = await request.post('/api/auth/admin/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(adminLoginResponse.ok()).toBeTruthy();
  const csrfHeaders = await csrfHeaderFor(request);
  const suffix = uniqueSuffix(testInfo.project.name, testInfo.parallelIndex);
  const portalEmail = `web-breakfast-overview-${suffix}@kajovohotel.local`;
  const portalPassword = `WebBreakfast-${suffix}-pass`;
  const createUserResponse = await request.post('/api/v1/users', {
    data: { email: portalEmail, password: portalPassword, first_name: 'Přehled', last_name: 'Snídaně', roles: ['snidane'] },
    headers: csrfHeaders,
  });
  expect(createUserResponse.status()).toBe(201);
  const createdUser = await createUserResponse.json() as { id: number };
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const arrivalDate = new Date(`${today}T12:00:00Z`);
  arrivalDate.setUTCDate(arrivalDate.getUTCDate() - 2);
  const departureDate = new Date(`${today}T12:00:00Z`);
  departureDate.setUTCDate(departureDate.getUTCDate() + 1);
  const requestedDates: string[] = [];
  let refreshed = false;
  await page.route('**/api/v1/breakfast/daily-overview?**', async (route) => {
    const requestedDate = new URL(route.request().url()).searchParams.get('service_date')!;
    requestedDates.push(requestedDate);
    const orders = [
      { id: 1, service_date: requestedDate, room_number: '101', guest_name: 'Jan Novák', guest_names: requestedDate === today ? 'Jan Novák; Eva Nováková' : `Den ${requestedDate}`, country_code: 'CZ', guest_count: requestedDate === today ? 2 : 1, note: 'Druhý polštář', status: 'pending', diet_no_gluten: requestedDate === today, diet_no_milk: false, diet_no_pork: false, reservations: requestedDate === today ? [{ reservation_id: 'res-1', guest_name: 'Jan Novák', arrival: arrivalDate.toISOString().slice(0, 10), departure: departureDate.toISOString().slice(0, 10), company_name: 'Příklad s.r.o.', breakfast_adults: 1, breakfast_children_0_2: 1, breakfast_children_3_17: 0, breakfast_age_unknown: 0, diet_no_gluten: true, diet_no_milk: false, diet_no_pork: false, version: 1 }] : [] },
      ...Array.from({ length: 12 }, (_, index) => ({ id: 10 + index, service_date: requestedDate, room_number: String(110 + index), guest_name: `Host ${index}`, guest_names: `Host ${index}`, country_code: 'CZ', guest_count: 1, note: null, status: 'pending', diet_no_gluten: false, diet_no_milk: false, diet_no_pork: false, reservations: [] })),
      ...(refreshed && requestedDate === today ? [{ id: 2, service_date: requestedDate, room_number: '102', guest_name: 'Petr Svoboda', guest_names: 'Petr Svoboda', country_code: 'SK', guest_count: 1, note: null, status: 'pending', diet_no_gluten: false, diet_no_milk: false, diet_no_pork: false, reservations: [] }] : []),
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      orders, summary: { service_date: requestedDate, total_orders: orders.length, total_guests: orders.reduce((sum, order) => sum + order.guest_count, 0), status_counts: { pending: orders.length, preparing: 0, served: 0, cancelled: 0 }, source_imported_at: new Date().toISOString() },
    }) });
  });
  try {
    const loginResponse = await request.post('/api/auth/login', { data: { email: portalEmail, password: portalPassword } });
    expect(loginResponse.ok()).toBeTruthy();
    const state = await request.storageState();
    await page.context().clearCookies();
    await page.context().addCookies(state.cookies);
    await page.goto('/snidane', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
    await expect(page.locator('.k-hk-datebar')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Dnes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Předchozí den' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Následující den' })).toBeVisible();
    const visibleList = await page.getByTestId('breakfast-serving-mobile-list').isVisible()
      ? page.getByTestId('breakfast-serving-mobile-list')
      : page.locator('.k-breakfast-serving-page .k-table-wrap');
    await expect(visibleList.getByText('Jan Novák; Eva Nováková').first()).toBeVisible();
    await expect(visibleList.getByText('Druhý polštář').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /aktualizovat|import pdf/i })).toHaveCount(0);
    await expect(page.getByLabel('Poznámka pro pokoj 101')).toHaveCount(0);
    refreshed = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(visibleList.getByText('Petr Svoboda').first()).toBeVisible();
    await page.getByRole('button', { name: 'Předchozí den' }).click();
    const selectedDate = page.locator('.k-hk-datebar input[type=date]');
    await expect(selectedDate).not.toHaveValue(today);
    const previousDate = await selectedDate.inputValue();
    await expect(visibleList.getByText(`Den ${previousDate}`, { exact: true }).first()).toBeVisible();
    await expect(page.locator('.k-grid.cards-3 .k-card').filter({ hasText: 'Snídaní celkem' }).locator('strong')).toHaveText('13');
    expect(requestedDates).toContain(previousDate);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
    await expect(selectedDate).toHaveValue(previousDate);
    await expect(visibleList.getByText(`Den ${previousDate}`, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Dnes' }).click();
    await expect(selectedDate).toHaveValue(today);
    await expect(visibleList.getByText('Jan Novák; Eva Nováková').first()).toBeVisible();
    await page.getByRole('button', { name: 'Dnes' }).click();
    await expect(visibleList.getByText('Jan Novák; Eva Nováková').first()).toBeVisible();
    await expect(page.locator('.k-grid.cards-3 .k-card').filter({ hasText: 'Snídaní celkem' }).locator('strong')).toHaveText('15');
    const dateControls = page.locator('.k-breakfast-date-controls');
    await expect(dateControls).toHaveCSS('position', 'sticky');
    await page.evaluate(() => window.scrollTo(0, 500));
    const controlsBounds = await dateControls.boundingBox();
    const stickyOffset = await dateControls.evaluate((element) => Number.parseFloat(getComputedStyle(element).top));
    expect(Math.abs(controlsBounds!.y - stickyOffset)).toBeLessThan(2);
    for (const width of [599, 600, 640, 641, 768, 1024, 1025, 1179, 1180]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const responsiveOffset = await dateControls.evaluate((element) => Number.parseFloat(getComputedStyle(element).top));
      if (width <= 1179) {
        const header = page.locator('.k-app-header');
        const headerLayout = await header.evaluate((element) => ({
          position: getComputedStyle(element).position,
          bottom: element.getBoundingClientRect().bottom,
        }));
        const controlsY = (await dateControls.boundingBox())!.y;
        if (headerLayout.position === 'sticky' || headerLayout.position === 'fixed') {
          expect(responsiveOffset).toBe(Math.ceil(headerLayout.bottom));
          expect(Math.abs(controlsY - headerLayout.bottom)).toBeLessThan(2);
        } else {
          expect(controlsY).toBeLessThanOrEqual(1);
        }
      } else {
        expect(responsiveOffset).toBe(96);
      }
    }
    const desktopHeadingFontSize = Number.parseFloat(await dateControls.locator('h1').evaluate((element) => getComputedStyle(element).fontSize));
    expect(desktopHeadingFontSize).toBeGreaterThan(32);
    const mobileCard = page.getByTestId('breakfast-serving-mobile-row').filter({ hasText: '101' });
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(mobileCard).toBeVisible();
      await expect(mobileCard).toContainText('Firma: Příklad s.r.o.');
      await expect(mobileCard).toContainText('Jan Novák; Eva Nováková');
      await expect(mobileCard.getByText('Česko')).toBeVisible();
      await expect(mobileCard).toContainText('2/3 nocí');
      await expect(mobileCard).toContainText('Dospělí: 1');
      await expect(mobileCard).toContainText('0–2 roky: 1');
      await expect(mobileCard.locator('.k-breakfast-serving-row__diets .k-diet-icon--active')).toHaveCount(1);
      await expect(mobileCard.getByRole('button', { name: 'Vydat' })).toBeVisible();
      const cardBounds = await mobileCard.boundingBox();
      expect(Math.abs(cardBounds!.width - width)).toBeLessThan(3);
    }
  } finally {
    await request.post('/api/auth/admin/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    await request.delete(`/api/v1/users/${createdUser.id}`, { headers: await csrfHeaderFor(request) });
  }
});

test('portal bez session skonci na loginu a download aplikace je pouze na mobilu', async ({ page }) => {
  await page.goto('/snidane', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/login\?next=%2Fsnidane$/);
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

  const appDownload = page.getByTestId('android-app-download');
  const appDownloadLink = page.getByTestId('android-app-download-link');
  await expect(appDownloadLink).toHaveAttribute('href', /\/downloads\/kajovo-hotel-android\.apk$/);
  if ((page.viewportSize()?.width ?? 0) <= 767) {
    await expect(appDownload).toBeVisible();
    await expect(appDownloadLink).toBeVisible();
  } else {
    await expect(appDownload).toBeHidden();
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

test('multirolni portal uzivatel vidi kazdy dostupny pohled v zapati', async ({ page, request }, testInfo) => {
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
      roles: ['recepce', 'pokojska', 'udrzba', 'snidane'],
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

  await expect(page.getByTestId('role-select-page')).toHaveCount(0);
  const tabs = page.getByTestId('portal-mobile-tabs');
  const roomsTab = tabs.getByRole('link', { name: 'Pokoje', exact: true }).or(tabs.getByRole('button', { name: 'Pokoje', exact: true }));
  await roomsTab.click();
  await expect(page).toHaveURL(/\/pokojska$/);
  await expect(tabs.locator('a, button')).toHaveCount(10);
  for (const name of ['Chat', 'Pokoje', 'Recepce', 'Snídaně', 'Nález', 'Závada', 'Ztráty a nálezy', 'Závady', 'Hlášení', 'Profil']) {
    const tab = tabs.getByRole('link', { name, exact: true }).or(tabs.getByRole('button', { name, exact: true }));
    await expect(tab).toBeVisible();
    if (name !== 'Chat') await expect(tab.locator('img')).toHaveAttribute('src', /\/assets\/[^/]+\.webp$/);
    await expect(tab.locator('span').last()).toBeVisible();
  }
  await tabs.getByRole('button', { name: /recepce/i }).click();
  await expect(page).toHaveURL(/\/recepce$/);
  await expect(tabs.getByRole('link', { name: /recepce/i })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('button', { name: /závady/i }).click();
  await expect(page).toHaveURL(/\/zavady$/);
  await expect(tabs.getByRole('link', { name: /závady/i })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('button', { name: /hlášení/i }).click();
  await expect(page).toHaveURL(/\/hlaseni$/);
  await expect(tabs.getByRole('link', { name: /hlášení/i })).toHaveAttribute('aria-current', 'page');
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

  await expect(page.getByTestId('role-select-page')).toHaveCount(0);
  const tabs = page.getByTestId('portal-mobile-tabs');
  const roomsTab = tabs.getByRole('link', { name: /pokoje/i }).or(tabs.getByRole('button', { name: /pokoje/i }));
  await roomsTab.click();
  await expect(page).toHaveURL(/\/pokojska$/);
  await expect(tabs.getByRole('link', { name: /pokoje/i }).or(tabs.getByRole('button', { name: /pokoje/i }))).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('button', { name: /snídaně/i }).click();

  await expect(page).toHaveURL(/\/snidane$/);
  await expect(tabs.getByRole('link', { name: /snídaně/i }).or(tabs.getByRole('button', { name: /snídaně/i }))).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
  await page.getByRole('button', { name: 'Odhlásit' }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.locator('#portal-email')).toBeVisible();
});

for (const scenario of ROLE_SCENARIOS) {
  test(`RBAC matice pro roli ${scenario.key} zobrazi jen povolene moduly a odmitne zakazane route`, async ({ page, request }, testInfo) => {
    const { portalEmail, portalPassword } = await createPortalUserForRole(request, testInfo, scenario.apiRole);

    await loginPortalUser(page, portalEmail, portalPassword);
    await expect(page).toHaveURL(new RegExp(`${scenario.startRoute.replace(/\//g, '\\/')}$`));
    await expect(page.getByTestId(ROUTE_TEST_IDS[scenario.startRoute])).toBeVisible();

    const expectedVisibleModules = scenario.visibleModules.filter((route) => MODULE_ROOTS.includes(route as typeof MODULE_ROOTS[number]));
    const visibleModuleRoutes = await collectVisibleModuleRoutes(page);
    expect(visibleModuleRoutes).toEqual([...expectedVisibleModules, '/chat'].sort());

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileTabs = page.getByTestId('portal-mobile-tabs');
    await expect(mobileTabs).toBeVisible();
    await expect(mobileTabs.locator('a, button')).toHaveCount(expectedVisibleModules.length + 2 + (scenario.key === 'pokojská' ? 2 : 0));
    expect(await collectVisibleModuleRoutes(page)).toEqual([...expectedVisibleModules, '/chat'].sort());
    await expect(mobileTabs.getByRole('link', { name: 'Profil' })).toBeVisible();
    await mobileTabs.getByRole('link', { name: 'Profil' }).click();
    await expect(page).toHaveURL(/\/profil$/);
    if (scenario.key === 'sklad') {
      await mobileTabs.getByRole('link', { name: 'Sklad' }).click();
      await expect(page).toHaveURL(/\/sklad$/);
      await mobileTabs.getByRole('link', { name: 'Profil' }).click();
      await mobileTabs.getByRole('link', { name: 'Hlášení' }).click();
      await expect(page).toHaveURL(/\/hlaseni$/);
      await mobileTabs.getByRole('link', { name: 'Profil' }).click();
    }
    await expect(mobileTabs.getByRole('link', { name: 'Profil' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.k-app-header')).toHaveCSS('position', 'fixed');
    const mobileGeometry = await page.evaluate(() => {
      const header = document.querySelector('.k-app-header')!.getBoundingClientRect();
      const brand = document.querySelector('.k-app-header .k-wordmark')!.getBoundingClientRect();
      const footer = document.querySelector('.k-portal-mobile-tabs')!.getBoundingClientRect();
      const flags = Array.from(document.querySelectorAll('.k-app-header .k-locale-switcher__option')).map((button) => button.getBoundingClientRect());
      return { headerTop: header.top, headerHeight: header.height, brandWidth: brand.width, brandTop: brand.top, brandBottom: brand.bottom, footerBottom: footer.bottom, footerHeight: footer.height, viewportHeight: window.innerHeight, flagsInside: flags.every((flag) => flag.top >= header.top && flag.bottom <= header.bottom) };
    });
    expect(mobileGeometry.headerTop).toBe(0);
    expect(mobileGeometry.headerHeight).toBe(64);
    expect(mobileGeometry.brandWidth).toBeGreaterThanOrEqual(42);
    expect(mobileGeometry.brandTop).toBeGreaterThanOrEqual(0);
    expect(mobileGeometry.brandBottom).toBeLessThanOrEqual(64);
    expect(mobileGeometry.flagsInside).toBeTruthy();
    expect(mobileGeometry.footerBottom).toBe(mobileGeometry.viewportHeight);
    expect(mobileGeometry.footerHeight).toBe(72);
    await page.evaluate(() => window.scrollTo(0, 500));
    await expect.poll(() => page.locator('.k-app-header').evaluate((header) => header.getBoundingClientRect().top)).toBe(0);
    await expect.poll(() => mobileTabs.evaluate((footer) => footer.getBoundingClientRect().bottom)).toBe(mobileGeometry.viewportHeight);
    await expect(page.getByRole('button', { name: 'Čeština' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'English' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Українська' })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });

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

for (const [locale, language] of [['cs', 'Čeština'], ['en', 'English'], ['uk', 'Українська']] as const) {
  test(`pokoje mají pevná razítka a lokalizovaný detail: ${locale}`, async ({ page, request }, testInfo) => {
    const keys = ['clean', 'dirty', 'technical_issue', 'do_not_disturb', 'stay_no_linen', 'stay_with_linen', 'windows_cleaned', 'painted'];
    const colors = ['rgb(34, 197, 94)', 'rgb(249, 115, 22)', 'rgb(240, 68, 82)', 'rgb(194, 83, 223)', 'rgb(167, 232, 184)', 'rgb(250, 204, 21)', 'rgb(59, 155, 234)', 'rgb(217, 184, 241)'];
    const states = ['confirmed', 'checked_in', 'checked_out', 'option'];
    const stay = { ...HOUSEKEEPING_ROOM_FIXTURE.departures[0], display_name: 'VelmiDlouhéPříjmeníVelmiDlouhéJméno', adults: 2, children: 1, infants: 1, persons: 4, main_guest_name: 'RezervujícíNezobrazit', company_name: 'Firma v detailu', country_name: 'Spojené království', country_code: 'GB', country_code_alpha3: 'GBR', dog_count: 2, cot_required: true, departure_time: '09:45', arrival_time: '14:05', housekeeping_note: 'Úplná poznámka\nDruhý řádek', guests: [{ name: 'Host Jedna', country_code: 'GB', age: 35, age_group: 'adults' }, { name: 'Host Dva', country_code: 'CZ', age: 30, age_group: 'adults' }, { name: 'Host Tři', country_code: 'CZ', age: 10, age_group: 'children' }, { name: 'Host Čtyři', country_code: 'CZ', age: 1, age_group: 'infants' }] };
    await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
      const date = new URL(route.request().url()).searchParams.get('date');
      await route.fulfill({ json: { date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [
        ...keys.map((key, i) => ({ ...HOUSEKEEPING_ROOM_FIXTURE, room_id: `room-${101+i}`, room_number: String(101+i), housekeeping_status_key: key, departures: [{ ...stay, reservation_state: states[i%4] }], arrivals: [{ ...stay, reservation_id: 'new', reservation_state: states[(i+1)%4], housekeeping_note: 'Poznámka příjezdu' }] })),
        { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: 'empty', room_number: '109', departures: [], arrivals: [], stays: [] },
        { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: 'stay', room_number: '203', departures: [], arrivals: [], stays: [{ ...stay, reservation_state: 'option' }] },
      ] } });
    });
    const user = await createPortalUserForRole(request, testInfo, 'pokojska');
    await loginPortalUser(page, user.portalEmail, user.portalPassword);
    await page.getByRole('button', { name: language, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const cards = page.locator('.k-hk-room');
    await expect(cards).toHaveCount(10);
    await expect(page.locator('.k-hk-help, .k-hk-legend')).toHaveCount(0);
    await expect(cards.first()).not.toContainText(stay.display_name);
    await expect(cards.first()).not.toHaveAttribute('aria-label', new RegExp(stay.display_name));
    await expect(cards.first()).not.toContainText(stay.company_name);
    for (let i=0; i<8; i++) await expect(cards.nth(i).locator('.k-hk-room__topline')).toHaveCSS('background-color', colors[i]);
    await expect(cards.first().locator('[data-stay-kind="departure"] .k-hk-request-icon')).toHaveCount(3);
    await expect(cards.first().locator('.k-hk-room__note-alert')).toHaveCount(2);
    await expect(cards.first().locator('.k-hk-reservation__country').first()).toHaveText('GBR');
    const countryLabel = new Intl.DisplayNames([locale], { type: 'region' }).of('GB')!;
    await expect(cards.first().locator('.k-hk-reservation__country').first()).toHaveAttribute('title', countryLabel);
    const content = await cards.evaluateAll((nodes) => nodes.flatMap((node) => Array.from(node.querySelectorAll('.k-hk-reservation')).map((block) => {
      const bounds = block.getBoundingClientRect();
      const rows = Array.from(block.children).map((row) => row.getBoundingClientRect());
      const counts = Array.from(block.querySelectorAll('.k-hk-person-counts > span')).map((count) => count.getBoundingClientRect());
      return {
        rowsInside: rows.every((row) => row.left >= bounds.left && row.right <= bounds.right + .5 && row.top >= bounds.top && row.bottom <= bounds.bottom + .5),
        countsInside: counts.every((count) => count.left >= bounds.left && count.right <= bounds.right + .5),
        countsAligned: Math.max(...counts.map((count) => count.y + count.height/2)) - Math.min(...counts.map((count) => count.y + count.height/2)) < 1,
        countrySize: parseFloat(getComputedStyle(block.querySelector('.k-hk-reservation__country')!).fontSize),
        rowCount: block.children.length,
        requestsInside: Array.from(block.querySelectorAll('.k-hk-request-icon')).every((icon) => { const r = icon.getBoundingClientRect(), bounds = icon.parentElement!.getBoundingClientRect(); return r.left >= bounds.left && r.right <= bounds.right + .5; }),
        iconHeight: block.querySelector('.k-hk-person-icon')!.getBoundingClientRect().height,
        kind: block.getAttribute('data-stay-kind'),
      };
    })));
    for (const block of content) {
      expect(block.rowsInside).toBeTruthy(); expect(block.countsInside).toBeTruthy(); expect(block.countsAligned).toBeTruthy();
      expect(block.countrySize).toBeGreaterThanOrEqual(12); expect(block.rowCount).toBe(4); expect(block.requestsInside).toBeTruthy();
      if (block.kind === 'stay') { expect(block.countrySize).toBeGreaterThanOrEqual(19); expect(block.iconHeight).toBeGreaterThanOrEqual(17); }
    }
    const geometry = await cards.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect(); const header = node.querySelector('.k-hk-room__topline')!.getBoundingClientRect();
      const number = node.querySelector('.k-hk-room__topline strong')!.getBoundingClientRect();
      return { height: rect.height, ratio: header.height/(rect.height-2), width: rect.width, center: Math.abs(number.x + number.width/2 - header.x - header.width/2) };
    }));
    expect(new Set(geometry.map((item) => item.height)).size).toBe(1);
    for (const item of geometry) { expect(item.ratio).toBeCloseTo(.15, 1); expect(item.center).toBeLessThan(1); }
    const contrasts = await cards.evaluateAll((nodes) => {
      const luminance = (rgb: string) => rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => v/255).map((v) => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum, v, i) => sum+v*[.2126, .7152, .0722][i], 0);
      return nodes.flatMap((node) => Array.from(node.querySelectorAll('.k-hk-room__topline, .k-hk-reservation')).map((element) => {
        const css = getComputedStyle(element), a = luminance(css.color), b = luminance(css.backgroundColor);
        return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      }));
    });
    expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5);
    if ((page.viewportSize()?.width ?? 0) < 600) {
      const original = page.viewportSize()!;
      await page.setViewportSize({ width: 320, height: 700 });
      const boundedCounts = await cards.first().locator('.k-hk-person-counts').evaluateAll((rows) => rows.every((row) => {
        const bounds = row.getBoundingClientRect();
        return Array.from(row.querySelectorAll('b')).every((count) => { const rect = count.getBoundingClientRect(); return rect.left >= bounds.left && rect.right <= bounds.right + .5; });
      }));
      expect(boundedCounts).toBeTruthy();
      await page.setViewportSize(original);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`room-stamps-${locale}.png`), fullPage: true });
    await cards.first().click();
    const detail = page.getByRole('dialog');
    await expect(detail.locator('.k-hk-status-actions button')).toHaveCount(8);
    await expect(detail).toContainText('Úplná poznámka');
    await expect(detail).toContainText('Poznámka příjezdu');
    await expect(detail).toContainText('Host Jedna');
    for (const guest of stay.guests) await expect(detail).toContainText(guest.name);
    await expect(detail).toContainText(stay.company_name);
    await expect(detail).not.toContainText(stay.main_guest_name);
    await expect(detail).not.toContainText(stay.display_name);
    await expect(detail.locator('dd').filter({ hasText: countryLabel })).toHaveCount(2);
    await expect(detail.locator('.k-hk-reservation-detail')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath(`room-detail-${locale}.png`), fullPage: true });
  });
}


for (const locale of ['cs', 'en', 'uk'] as const) {
  test(`pokoje potvrzují automatické požadavky konkrétní rezervace a obnovují persistenci: ${locale}`, async ({ page, request }, testInfo) => {
    const confirmations: Record<string, { kind: string; state: string; version: number; active: boolean }> = {};
    let blockNext = false;
    let release: (() => void) | undefined;
    const changes: { id: string; kind: string }[] = [];
    await page.route('**/api/v1/housekeeping/reservations/**/requirements/**/confirm**', async (route) => {
      const match = new URL(route.request().url()).pathname.match(/reservations\/([^/]+)\/requirements\/(dog|cot)\/confirm$/)!;
      expect(route.request().method()).toBe('POST');
      expect(new URL(route.request().url()).searchParams.get('room_id')).toBe('room-101');
      const [, id, kind] = match;
      const payload = route.request().postDataJSON();
      expect(payload).toEqual({version: 0, quantity: kind === 'dog' ? 2 : 1});
      changes.push({id, kind});
      if (blockNext) { blockNext = false; await new Promise<void>(resolve => { release = resolve; }); }
      const confirmation = {kind, state: 'green', version: 1, active: true};
      confirmations[id+kind] = confirmation;
      await route.fulfill({json: confirmation});
    });
    await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
      const date = new URL(route.request().url()).searchParams.get('date');
      const stay = (id: string) => ({...HOUSEKEEPING_ROOM_FIXTURE.departures[0], reservation_id: id, dog_count: 2, cot_required: true, amenities: Object.entries(confirmations).filter(([key])=>key.startsWith(id)).map(([,value])=>value)});
      await route.fulfill({json: {date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [{...HOUSEKEEPING_ROOM_FIXTURE, departures: [stay('old')], arrivals: [stay('new')]}]}});
    });
    const user = await createPortalUserForRole(request, testInfo, 'pokojska');
    await loginPortalUser(page, user.portalEmail, user.portalPassword);
    await page.getByRole('button', { name: {cs:'Čeština',en:'English',uk:'Українська'}[locale], exact:true }).click();
    const card = page.locator('.k-hk-room').first();
    await expect(card.locator('[data-request-state="red"]')).toHaveCount(6);
    await card.click();
    const dialog = page.getByRole('dialog');
    const arrival = dialog.locator('[data-reservation-id="new"]');
    const confirmLabel = {cs:'Potvrdit',en:'Confirm',uk:'Підтвердити'}[locale];
    const dog = {cs:'Pes',en:'Dog',uk:'Собака'}[locale];
    const cot = {cs:'Dětská postýlka',en:'Baby cot',uk:'Дитяче ліжечко'}[locale];
    blockNext = true;
    await arrival.getByRole('button',{name:`${confirmLabel}: ${dog} ×2`,exact:true}).click();
    await expect(dialog).toContainText({cs:'Potvrzuji připravený požadavek…',en:'Confirming the prepared requirement…',uk:'Підтверджую підготовлену вимогу…'}[locale]);
    await expect(dialog.getByRole('button')).toHaveCount(0);
    await expect.poll(()=>Boolean(release)).toBeTruthy(); release!();
    await expect(arrival.locator('[data-request-kind="dog"][data-request-state="green"]')).toHaveCount(2);
    await expect(arrival.locator('[data-request-kind="cot"][data-request-state="red"]')).toHaveCount(1);
    await arrival.getByRole('button',{name:`${confirmLabel}: ${cot}`,exact:true}).click();
    await expect(arrival.locator('[data-request-state="green"]')).toHaveCount(3);
    await expect(dialog.locator('[data-reservation-id="reservation-old"]')).toHaveCount(0);
    await expect(dialog.locator('[data-reservation-id="old"] [data-request-state="red"]')).toHaveCount(3);
    await dialog.getByRole('button',{name:{cs:'Zavřít dialog',en:'Close dialog',uk:'Закрити діалог'}[locale]}).click();
    await expect(card.locator('[data-stay-kind="arrival"] [data-request-state="green"]')).toHaveCount(3);
    await page.screenshot({path:testInfo.outputPath(`confirmed-${locale}.png`),fullPage:true});
    await page.reload();
    await expect(card.locator('[data-stay-kind="arrival"] [data-request-state="green"]')).toHaveCount(3);
    await expect(card.locator('[data-stay-kind="departure"] [data-request-state="red"]')).toHaveCount(3);
    expect(changes).toEqual([{id:'new',kind:'dog'},{id:'new',kind:'cot'}]);
  });
}

test('pokoje po nejistém potvrzení požadavku blokují opakování do obnovy', async ({ page, request }, testInfo) => {
  let posts = 0;
  await page.route('**/api/v1/housekeeping/reservations/**/requirements/**/confirm**', async route => { posts++; await route.fulfill({status: 409, json:{detail:'changed'}}); });
  await page.route('**/api/v1/housekeeping/rooms**', async route => {
    const date = new URL(route.request().url()).searchParams.get('date');
    await route.fulfill({json:{date, occupancy_date:date, housekeeping_status_is_current:true, loaded_at:new Date().toISOString(), rooms:[{...HOUSEKEEPING_ROOM_FIXTURE, arrivals:[{...HOUSEKEEPING_ROOM_FIXTURE.departures[0], reservation_id:'new', dog_count:1}]}]}});
  });
  const user = await createPortalUserForRole(request,testInfo,'pokojska'); await loginPortalUser(page,user.portalEmail,user.portalPassword);
  await page.locator('.k-hk-room').first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Potvrdit: Pes ×1',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Potvrzení se nepodařilo ověřit');
  await expect(dialog.getByRole('button',{name:'Potvrdit: Pes ×1',exact:true})).toBeDisabled();
  expect(posts).toBe(1);
  await dialog.getByRole('button',{name:'Obnovit stav',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Potvrdit: Pes ×1',exact:true})).toBeEnabled();
  expect(posts).toBe(1);
});
