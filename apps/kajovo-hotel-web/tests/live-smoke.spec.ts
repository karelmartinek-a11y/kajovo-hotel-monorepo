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
  housekeeping_color: '#F57621',
  operational_state: 'checkout_departed_dirty',
  occupancy_state: 'free',
  departures: [{ reservation_id: 'reservation-old', guest_label: 'Novákovi', persons: 2, country_name: 'Česko', arrival: '2026-09-15', departure: '2026-09-17', checked_in: '2026-09-15T14:00:00Z', checked_out: '2026-09-17T10:00:00Z', amenities: [] }],
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
  await page.getByRole('button', { name: /prihlasit|přihlásit/i }).click();
}

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

test('pokoje půlí barvy a počítají noci podle vybraného dne', async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let checkedOut = false;
  let ready = true;
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date')!;
    const newYear = date === '2027-01-01';
    const stay = { ...HOUSEKEEPING_ROOM_FIXTURE.departures[0], arrival: newYear ? '2026-12-30' : '2026-03-28', departure: newYear ? date : '2026-03-30', checked_out: checkedOut ? '2026-03-30T10:00:00Z' : null };
    const arrival = { ...stay, reservation_id: 'new', guest_label: 'Příjezdový host', arrival: date, departure: newYear ? '2027-01-02' : '2026-03-31', checked_out: null };
    await route.fulfill({ json: { date, occupancy_date: '2026-09-18', housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [
      { ...HOUSEKEEPING_ROOM_FIXTURE, ready_for_arrival: ready, departures: [stay], arrivals: [arrival] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '102', room_number: '102', ready_for_arrival: ready, departures: [], arrivals: [arrival] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '103', room_number: '103', departures: [stay], arrivals: [] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '104', room_number: '104', departures: [], arrivals: [], stays: [{ ...stay, departure: '2026-04-01' }] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '105', room_number: '105', housekeeping_status_key: 'clean', ready_for_arrival: false, departures: [], arrivals: [], stays: [] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '106', room_number: '106', housekeeping_status_key: 'stay_no_linen', ready_for_arrival: false, departures: [], arrivals: [], stays: [] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '107', room_number: '107', housekeeping_status_key: 'stay_with_linen', ready_for_arrival: false, departures: [], arrivals: [], stays: [] },
      { ...HOUSEKEEPING_ROOM_FIXTURE, room_id: '108', room_number: '108', housekeeping_status_key: 'dirty', ready_for_arrival: false, departures: [], arrivals: [], stays: [] },
    ] } });
  });
  const user = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  await page.getByLabel('Vybraný den', { exact: true }).fill('2026-03-30');
  const card = page.getByRole('button', { name: /pokoj 101,/i });
  await expect(card).toHaveClass(/k-hk-room--left-red/);
  await expect(card).toHaveClass(/k-hk-room--right-green/);
  await expect(card.locator('.k-hk-room__housekeeping')).toHaveCSS('color', 'rgb(17, 17, 17)');
  await expect(card).toContainText('Prázdný teď');
  await expect(card).toContainText('Odj.');
  await expect(card).toContainText('Příj.');
  await card.click();
  const detail = page.getByRole('dialog');
  await expect(detail).toContainText('Noc pobytu: 2/2');
  await expect(detail).toContainText('Noc pobytu: 0/1');
  await detail.getByRole('button', { name: 'Zavřít dialog' }).click();
  await expect(page.getByRole('button', { name: /pokoj 102,/i })).toHaveClass(/k-hk-room--left-empty/);
  await expect(page.getByRole('button', { name: /pokoj 103,/i })).toHaveClass(/k-hk-room--right-empty/);
  const continuing = page.getByRole('button', { name: /pokoj 104,/i });
  await expect(continuing).not.toHaveClass(/k-hk-room--split/);
  await continuing.click();
  await expect(page.getByRole('dialog')).toContainText('Noc pobytu: 2/4');
  await page.getByRole('dialog').getByRole('button', { name: 'Zavřít dialog' }).click();
  await expect(page.getByRole('button', { name: /pokoj 105,/i })).toHaveClass(/k-hk-room--right-green/);
  await page.getByText('Vysvětlivky barev').click();
  await expect(page.getByText('Uklizený pokoj', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /pokoj 106,/i })).toHaveClass(/k-hk-room--right-light-green/);
  await expect(page.getByRole('button', { name: /pokoj 107,/i })).toHaveClass(/k-hk-room--right-light-green/);
  await expect(page.getByRole('button', { name: /pokoj 108,/i })).not.toHaveClass(/k-hk-room--split/);
  const bounds = await card.boundingBox();
  const previewBounds = await card.locator('.k-hk-room__preview').boundingBox();
  expect(previewBounds!.width).toBeGreaterThan(bounds!.width * .8);
  expect(await card.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('50%');
  await page.screenshot({ path: testInfo.outputPath('room-split-colors.png'), fullPage: true });
  checkedOut = true;
  ready = false;
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect(card).toHaveClass(/k-hk-room--left-neutral/);
  await expect(card).toHaveClass(/k-hk-room--right-red/);
  await expect(page.getByLabel('Vybraný den', { exact: true })).toHaveValue('2026-03-30');
  await page.getByLabel('Vybraný den', { exact: true }).fill('2027-01-01');
  await card.click();
  await expect(page.getByRole('dialog')).toContainText('Noc pobytu: 2/2');
  await expect(page.getByRole('dialog')).toContainText('Noc pobytu: 0/1');
  await page.getByRole('dialog').getByRole('button', { name: 'Zavřít dialog' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
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
  await expect(footer.locator('a, button')).toHaveCount(4);
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
        rooms: HOUSEKEEPING_ROOM_FIXTURES.map((room) => room.room_id === 'room-101' && patchBody ? { ...room, housekeeping_status: 'Uklizeno pro nájezd', operational_state: 'checkout_departed_clean' } : room),
      }),
    });
  });
  const { portalEmail, portalPassword } = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, portalEmail, portalPassword);
  await expect(page).toHaveURL(/\/pokojska$/);
  await expect(page.getByTestId('housekeeping-rooms-view')).toBeVisible();
  await page.getByRole('button', { name: /pokoj 101, VOLNO/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Neuklizeno');
  await dialog.getByRole('button', { name: /^Uklizeno /i }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /pokoj 101/i })).toContainText('Uklizeno pro nájezd');
  expect(patchBody).toEqual({ status: 'clean' });
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
  const response = (date: string, label: string) => ({ date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [{ ...HOUSEKEEPING_ROOM_FIXTURE, departures: [{ ...HOUSEKEEPING_ROOM_FIXTURE.departures[0], guest_label: label }] }] });
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    count += 1;
    if (count === 2) { held = route; return; }
    await route.fulfill({ json: response(new URL(route.request().url()).searchParams.get('date')!, count === 1 ? 'První den' : 'Nový den') });
  });
  const user = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  await expect(page.getByRole('button', { name: /pokoj 101/i })).toContainText('První den');
  await page.getByRole('button', { name: 'Předchozí den' }).click();
  await expect.poll(() => Boolean(held)).toBe(true);
  await page.getByRole('button', { name: 'Předchozí den' }).click();
  await expect(page.getByRole('button', { name: /pokoj 101/i })).toContainText('Nový den');
  await held!.fulfill({ json: response(new URL(held!.request().url()).searchParams.get('date')!, 'Starý den') });
  await expect(page.getByRole('button', { name: /pokoj 101/i })).toContainText('Nový den');
});

for (const role of ['recepce', 'pokojska']) {
  test(`pokoje oddělují pobyty a oprávnění ikon: ${role}`, async ({ page, request }, testInfo) => {
    const icons = [{ kind: 'dog', state: 'red', version: 1, active: true }];
    const mutations: string[] = [];
    await page.route('**/api/v1/housekeeping/reservations/**', async (route) => {
      mutations.push(route.request().method());
      expect(route.request().url()).toContain('/reservation-new/');
      if (route.request().method() === 'PATCH') { icons[0].state = 'green'; icons[0].version += 1; }
      else if (route.request().method() === 'DELETE') { icons[0].active = false; icons[0].version += 1; }
      else { icons[0].active = true; icons[0].state = 'red'; icons[0].version += 1; }
      await route.fulfill({ json: icons[0] });
    });
    await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
      const date = new URL(route.request().url()).searchParams.get('date');
      await route.fulfill({ json: { date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms: [{ ...HOUSEKEEPING_ROOM_FIXTURE,
        operational_state: 'arrived', occupancy_state: 'arrived',
        arrivals: [{ ...HOUSEKEEPING_ROOM_FIXTURE.departures[0], reservation_id: 'reservation-new', guest_label: 'Přijíždějící host', country_name: null, amenities: icons }],
      }] } });
    });
    const user = await createPortalUserForRole(request, testInfo, role);
    await loginPortalUser(page, user.portalEmail, user.portalPassword);
    if (role === 'recepce') { await expect(page).toHaveURL(/\/recepce$/); await page.goto('/pokojska'); }
    const card = page.getByRole('button', { name: /pokoj 101/i });
    await expect(card).toContainText('Novákovi');
    await expect(card).toContainText('Přijíždějící host');
    await page.screenshot({ path: testInfo.outputPath(`pokoje-board-${role}.png`), fullPage: true });
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileTabs = page.getByTestId('portal-mobile-tabs');
    await expect(mobileTabs.getByRole('link', { name: /Pokoje/ })).toBeVisible();
    await mobileTabs.getByRole('link', { name: /Pokoje/ }).click();
    await expect(page).toHaveURL(/\/pokojska$/);
    await expect(page.getByTestId('module-navigation-phone')).toBeHidden();
    if (originalViewport) await page.setViewportSize(originalViewport);
    await card.click();
    await expect(page.getByRole('dialog')).toContainText('Stát neuveden');
    await expect(page.getByRole('dialog')).toContainText('Česko');
    await page.getByRole('dialog').getByRole('button', { name: 'Pobyty a ikony' }).click();
    const dialog = page.getByTestId('housekeeping-stay-screen');
    await dialog.getByRole('button', { name: 'Pes: Čeká → hotovo' }).click();
    await expect(dialog.getByRole('button', { name: 'Pes: Hotovo → čeká' })).toBeVisible();
    if (role === 'recepce') {
      await dialog.getByRole('button', { name: 'Odebrat: Pes', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Přidat: Pes', exact: true })).toHaveCount(2);
      await dialog.getByRole('button', { name: 'Přidat: Pes', exact: true }).last().click();
      await expect(dialog.getByRole('button', { name: 'Pes: Čeká → hotovo' })).toBeVisible();
      expect(mutations).toEqual(['PATCH', 'DELETE', 'POST']);
    } else {
      await expect(dialog.getByRole('button', { name: /Přidat:|Odebrat:/ })).toHaveCount(0);
      expect(mutations).toEqual(['PATCH']);
    }
    await page.screenshot({ path: testInfo.outputPath(`pokoje-${role}.png`), fullPage: true });
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
  let refreshed = false;
  await page.route('**/api/v1/breakfast/daily-overview?**', async (route) => {
    const orders = [
      { id: 1, service_date: today, room_number: '101', guest_name: 'Jan Novák', guest_names: 'Jan Novák; Eva Nováková', country_code: 'CZ', guest_count: 2, note: 'Druhý polštář', status: 'pending', diet_no_gluten: false, diet_no_milk: false, diet_no_pork: false, reservations: [] },
      ...(refreshed ? [{ id: 2, service_date: today, room_number: '102', guest_name: 'Petr Svoboda', guest_names: 'Petr Svoboda', country_code: 'SK', guest_count: 1, note: null, status: 'pending', diet_no_gluten: false, diet_no_milk: false, diet_no_pork: false, reservations: [] }] : []),
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      orders, summary: { service_date: today, total_orders: orders.length, total_guests: orders.reduce((sum, order) => sum + order.guest_count, 0), status_counts: { pending: orders.length, preparing: 0, served: 0, cancelled: 0 }, source_imported_at: new Date().toISOString() },
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
    await expect(visibleList.getByText('Česko').first()).toBeVisible();
    await expect(visibleList.getByText('Druhý polštář').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /aktualizovat|import pdf/i })).toHaveCount(0);
    await expect(page.getByLabel('Poznámka pro pokoj 101')).toHaveCount(0);
    refreshed = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(visibleList.getByText('Petr Svoboda').first()).toBeVisible();
    await page.getByRole('button', { name: 'Předchozí den' }).click();
    await expect(page.locator('.k-hk-datebar input[type=date]')).not.toHaveValue(today);
    await page.getByRole('button', { name: 'Dnes' }).click();
    await expect(page.locator('.k-hk-datebar input[type=date]')).toHaveValue(today);
  } finally {
    await request.post('/api/auth/admin/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    await request.delete(`/api/v1/users/${createdUser.id}`, { headers: await csrfHeaderFor(request) });
  }
});

test('portal bez session skonci na loginu a download aplikace je pouze na mobilu', async ({ page }) => {
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

  const appDownload = page.getByTestId('android-app-download');
  const appDownloadLink = page.getByTestId('android-app-download-link');
  await expect(appDownloadLink).toHaveAttribute('href', '/downloads/kajovo-hotel-android.apk');
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

  await expect(page.getByTestId('role-select-page')).toBeVisible();
  await page.getByRole('button', { name: /pokračovat jako pokojská/i }).click();

  await expect(page).toHaveURL(/\/pokojska$/);
  const tabs = page.getByTestId('portal-mobile-tabs');
  await expect(tabs.locator('a, button')).toHaveCount(9);
  for (const name of ['Profil', 'Pokoje', 'Recepce', 'Snídaně', 'Nález', 'Závada', 'Ztráty a nálezy', 'Závady', 'Hlášení']) {
    const tab = tabs.getByRole('link', { name, exact: true }).or(tabs.getByRole('button', { name, exact: true }));
    await expect(tab).toBeVisible();
    await expect(tab.locator('img')).toHaveAttribute('src', /\/assets\/[^/]+\.webp$/);
    await expect(tab.locator('span')).toBeVisible();
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

  await expect(page.getByTestId('role-select-page')).toBeVisible();
  await page.getByTestId('role-select-page').getByRole('button').first().click();

  await expect(page).toHaveURL(/\/pokojska$/);
  await expect(page.getByTestId('portal-mobile-tabs').getByRole('link', { name: /pokoje/i })).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('portal-mobile-tabs').getByRole('button', { name: /snídaně/i }).click();

  await expect(page).toHaveURL(/\/snidane$/);
  await expect(page.getByTestId('portal-mobile-tabs').getByRole('link', { name: /snídaně/i })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
  await page.getByRole('button', { name: 'Odhlásit' }).click();
  await expect(page).toHaveURL(/\/login$/);
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

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileTabs = page.getByTestId('portal-mobile-tabs');
    await expect(mobileTabs).toBeVisible();
    await expect(mobileTabs.locator('a, button')).toHaveCount(expectedVisibleModules.length + 1 + (scenario.key === 'pokojská' ? 2 : 0));
    expect(await collectVisibleModuleRoutes(page)).toEqual(expectedVisibleModules.slice().sort());
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
