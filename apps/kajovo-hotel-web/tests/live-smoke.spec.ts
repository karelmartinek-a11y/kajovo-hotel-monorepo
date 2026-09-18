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
    visibleModules: ['/pokojska', '/snidane', '/ztraty-a-nalezy', '/hlaseni'],
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
    ] } });
  });
  const user = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  await page.getByLabel('Vybraný den', { exact: true }).fill('2026-03-30');
  const card = page.getByRole('button', { name: /pokoj 101,/i });
  await expect(card).toHaveClass(/k-hk-room--left-red/);
  await expect(card).toHaveClass(/k-hk-room--right-green/);
  await expect(card.locator('.k-hk-room__housekeeping')).toHaveCSS('color', 'rgb(17, 17, 17)');
  await expect(card).toContainText('Noc pobytu: 2/2');
  await expect(card).toContainText('Noc pobytu: 0/1');
  await expect(page.getByRole('button', { name: /pokoj 102,/i })).toHaveClass(/k-hk-room--left-empty/);
  await expect(page.getByRole('button', { name: /pokoj 103,/i })).toHaveClass(/k-hk-room--right-empty/);
  const continuing = page.getByRole('button', { name: /pokoj 104,/i });
  await expect(continuing).not.toHaveClass(/k-hk-room--split/);
  await expect(continuing).toContainText('Noc pobytu: 2/4');
  const bounds = await card.boundingBox();
  const textBounds = await card.locator('.k-hk-room__state').boundingBox();
  expect(textBounds!.width).toBeGreaterThan(bounds!.width * .8);
  expect(await card.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('50%');
  await page.screenshot({ path: testInfo.outputPath('room-split-colors.png'), fullPage: true });
  checkedOut = true;
  ready = false;
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect(card).toHaveClass(/k-hk-room--left-neutral/);
  await expect(card).toHaveClass(/k-hk-room--right-red/);
  await expect(page.getByLabel('Vybraný den', { exact: true })).toHaveValue('2026-03-30');
  await page.getByLabel('Vybraný den', { exact: true }).fill('2027-01-01');
  await expect(card).toContainText('Noc pobytu: 2/2');
  await expect(card).toContainText('Noc pobytu: 0/1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('pokoje po zúžení okna nezachovají šířku dříve vykresleného patra', async ({ page, request }, testInfo) => {
  const rooms = ['3', '2', '1', '0'].flatMap((floor) => Array.from({ length: floor === '3' ? 14 : floor === '0' ? 7 : 8 }, (_, index) => ({
    ...HOUSEKEEPING_ROOM_FIXTURE, floor, room_id: `${floor}-${index}`, room_number: `${floor}${String(index + 1).padStart(2, '0')}`,
  })));
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date')!;
    await route.fulfill({ json: { date, occupancy_date: date, housekeeping_status_is_current: true, loaded_at: new Date().toISOString(), rooms } });
  });
  const user = await createPortalUserForRole(request, testInfo, 'pokojska');
  await loginPortalUser(page, user.portalEmail, user.portalPassword);
  const firstCard = page.locator('.k-hk-room').first();
  await expect(firstCard).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await firstCard.scrollIntoViewIfNeeded();
    await expect.poll(() => firstCard.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(width);
    await expect.poll(() => page.locator('.k-hk-board').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(width);
  }
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
    await expect(card).toContainText('Stát neuveden');
    await expect(card).toContainText('Česko');
    await page.screenshot({ path: testInfo.outputPath(`pokoje-board-${role}.png`), fullPage: true });
    await card.click();
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
