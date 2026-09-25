import { expect, test, type APIRequestContext } from '@playwright/test';
import { getAdminCredentials } from '../test-admin-credentials';

test('uživatelé mají oddělený editor, validace, zachování konceptu a responzivní seznam', async ({ page, request }) => {
  const credentials = getAdminCredentials();
  expect((await request.post('/api/auth/admin/login', { data: credentials })).ok()).toBeTruthy();
  const state = await request.storageState();
  await page.context().addCookies(state.cookies);
  const csrf = state.cookies.find((cookie) => cookie.name === 'kajovo_csrf')!.value;
  const email = `ui-${Date.now()}@example.com`;
  const created = await request.post('/api/v1/users', { headers: { 'x-csrf-token': csrf }, data: { first_name: 'Alexandra', last_name: 'Velmi Dlouhé Příjmení Pro Kontrolu', email, roles: ['pokojská', 'recepce', 'snídaně'] } });
  expect(created.status()).toBe(201);
  const user = await created.json();
  try {
    await page.goto('/admin/uzivatele');
    await expect(page.locator('.k-wordmark-mark')).toHaveAttribute('src', /kajovo-hotel_mark\.svg$/);
    await expect(page.locator('.k-wordmark-name')).toContainText('KájovoHotel');
    const row = page.getByRole('row').filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(page.getByLabel('Jméno *', { exact: true })).toHaveCount(0);
    for (const size of [{ width: 1440, height: 900 }, { width: 834, height: 1112 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await expect(row.getByRole('button', { name: /Upravit/ })).toBeVisible();
      await page.screenshot({ path: `/tmp/kajovo-users-${size.width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await row.getByRole('button', { name: /Upravit/ }).click();
    await page.getByLabel('Jméno *', { exact: true }).fill('Změněné');
    await page.getByRole('button', { name: 'Další', exact: true }).click();
    await page.getByLabel('Sklad', { exact: true }).check();
    await page.getByRole('button', { name: 'Další', exact: true }).click();
    await page.getByLabel('Telefon', { exact: true }).fill('777123456');
    await page.getByLabel('Poznámka', { exact: true }).fill('Zachovaný koncept');
    await page.getByRole('button', { name: /Zpět na uživatele/ }).click();
    await expect(page.getByRole('dialog')).toContainText('neuložené');
    await page.getByRole('button', { name: 'Pokračovat v úpravách' }).click();
    await expect(page.getByLabel('Poznámka', { exact: true })).toHaveValue('Zachovaný koncept');
    await page.getByRole('button', { name: 'Uložit změny' }).click();
    await expect(page.getByRole('heading', { name: 'Uživatelé', exact: true })).toBeVisible();
    const saved = await (await request.get(`/api/v1/users/${user.id}`)).json();
    expect(saved.first_name).toBe('Změněné'); expect(saved.roles).toContain('sklad'); expect(saved.phone).toBe('+420777123456'); expect(saved.note).toBe('Zachovaný koncept');
    await row.getByRole('button', { name: /Upravit/ }).click();
    await page.getByRole('button', { name: 'Zakázat přístup', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Povolit přístup', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Povolit přístup', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Zakázat přístup', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Odeslat odkaz pro reset hesla' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Zavřít', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).not.toContainText('Čekám na potvrzení');
    await page.getByRole('dialog').getByRole('button', { name: 'Zavřít', exact: true }).click();
    await page.getByRole('button', { name: /Zpět na uživatele/ }).click();
    await page.getByRole('button', { name: 'Nový uživatel', exact: true }).click();
    await page.getByRole('button', { name: 'Další', exact: true }).click();
    await expect(page.getByText('Vyplňte 1 až 120 znaků.')).toHaveCount(2);
    await page.getByLabel('Jméno *', { exact: true }).fill('Nový');
    await page.getByLabel('Příjmení *', { exact: true }).fill('Uživatel');
    await page.getByLabel('E-mail *', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Další', exact: true }).click();
    await page.getByLabel('Administrátor', { exact: true }).check();
    await page.getByRole('button', { name: 'Další', exact: true }).click();
    await expect(page.getByText('Potvrďte udělení administrátorských práv.')).toBeVisible();
    await page.getByLabel('Potvrzuji vědomé udělení administrátorských práv.').check();
    await page.getByRole('button', { name: 'Další', exact: true }).click();
    await page.getByRole('button', { name: 'Vytvořit uživatele', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('E-mail už používá');
    await page.getByRole('button', { name: '1 Údaje', exact: true }).click();
    await expect(page.getByLabel('E-mail *', { exact: true })).toHaveValue(email);
    await page.screenshot({ path: '/tmp/kajovo-user-editor-mobile.png', fullPage: true });
    await page.getByRole('button', { name: /Zpět na uživatele/ }).click();
    await page.getByRole('button', { name: 'Zahodit změny' }).click();
    await row.getByRole('button', { name: /Upravit/ }).click();
    await page.getByRole('button', { name: 'Smazat uživatele', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(email);
    await page.getByRole('dialog').getByRole('button', { name: 'Zrušit', exact: true }).click();
    await page.getByRole('button', { name: 'Smazat uživatele', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Smazat', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Uživatelé', exact: true })).toBeVisible();
    await expect(row).toHaveCount(0);
  } finally { await request.delete(`/api/v1/users/${user.id}`, { headers: { 'x-csrf-token': csrf } }); }
});

test('pokoje mají provozní pořadí, čtyři dlaždice na mobilu, spodní detail a chyba nehlásí úspěch', async ({ page, request }) => {
  expect((await request.post('/api/auth/admin/login', { data: getAdminCredentials() })).ok()).toBeTruthy();
  await page.context().addCookies((await request.storageState()).cookies);
  const stay = { reservation_id: 'r1', guest_label: 'Alexandra Velmi Dlouhé Příjmení', country_name: 'Spojené království Velké Británie a Severního Irska', persons: 3, arrival: '2026-09-17', departure: '2026-09-19', amenities: [{ kind: 'dog', state: 'red', version: 1, active: true }] };
  const expectedOrder = [101, 102, 103, 104, 105, 106, 107, 108, 109, 203, 204, 205, 206, 207, 208, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 221, 222, 223, 224, 321, 322, 323, 324, 201, 202, 209, 210, 410];
  const rooms = expectedOrder.slice().reverse().map((number, i) => ({ room_id: String(number), room_number: String(number), room_name: String(number), floor: String(number)[0], housekeeping_status: 'Neuklizeno', operational_state: 'checkout_pending', occupancy_state: 'departing', occupied: number === 101 || i % 2 === 0, persons: number === 101 || i % 2 === 0 ? 3 : 0, departures: [stay], arrivals: [{ ...stay, reservation_id: 'r2', guest_label: 'Přijíždějící host' }], stays: [], ready_for_arrival: false }));
  await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
    if (route.request().method() === 'PATCH') { await route.fulfill({ status: 502, json: { detail: 'Ověření změny selhalo.' } }); return; }
    await route.fulfill({ json: { date: '2026-09-18', occupancy_date: '2026-09-18', loaded_at: new Date().toISOString(), housekeeping_status_is_current: true, rooms } });
  });
  await page.goto('/admin/pokojska');
  const cards = page.locator('.k-hk-room');
  await expect(cards).toHaveCount(38);
  expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.querySelector('.k-hk-room__topline strong')?.textContent))).toEqual(expectedOrder.map(String));
  for (const size of [{ width: 1440, height: 900 }, { width: 834, height: 1112 }, { width: 390, height: 844 }, { width: 320, height: 700 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.k-hk-board').evaluate((node) => node.scrollTo({ top: 0 }));
    if (size.width <= 1023) {
      const board = await page.locator('.k-hk-board').boundingBox();
      const navigation = await page.locator('.k-housekeeping-toggle').boundingBox();
      expect(board!.y + board!.height).toBeLessThanOrEqual(navigation!.y + 1);
      const controls = page.locator('.k-hk-board__controls');
      const controlsY = (await controls.boundingBox())!.y;
      await page.locator('.k-hk-board').evaluate((node) => node.scrollTo({ top: 250 }));
      expect(Math.abs((await controls.boundingBox())!.y - controlsY)).toBeLessThan(2);
      await page.locator('.k-hk-board').evaluate((node) => node.scrollTo({ top: 0 }));
    }
    if (size.width <= 390) {
      await expect(page.locator('.k-shell-profile-link .k-nav-link__icon')).toBeVisible();
      await page.getByTestId('module-navigation-phone').getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('dialog', { name: 'Navigace' }).getByRole('menuitem', { name: /Přehled/ }).click();
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
      await page.goto('/admin/pokojska');
      await expect(cards).toHaveCount(38);
    }
    const boxes = await cards.evaluateAll((nodes) => nodes.slice(0, 5).map((node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
    if (size.width <= 390) {
      expect(boxes.slice(0, 4).every((box) => Math.abs(box.y - boxes[0].y) < 2)).toBeTruthy();
      expect(boxes[4].y).toBeGreaterThan(boxes[0].y + boxes[0].h);
    }
    expect(boxes.every((box) => Math.abs(box.h - boxes[0].h) < 1)).toBeTruthy();
    expect(boxes.every((box) => Math.abs(box.w - boxes[0].w) < 1)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `/tmp/kajovo-rooms-${size.width}.png`, fullPage: false });
    await cards.first().screenshot({ path: `/tmp/kajovo-room-card-${size.width}.png` });
    await cards.first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    expect(await modal.evaluate((node) => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && Math.abs(r.bottom - innerHeight) <= 2; })).toBeTruthy();
    await expect(modal).toContainText('Alexandra Velmi Dlouhé Příjmení');
    await expect(modal).toContainText('Uvnitř teď');
    await page.screenshot({ path: `/tmp/kajovo-status-${size.width}.png` });
    await modal.getByRole('button', { name: 'Zavřít dialog' }).click();
  }
  await cards.first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Uklizeno/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Změnu se nepodařilo ověřit');
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Uklizeno/ })).toHaveCount(0);
  expect(await page.getByRole('dialog').evaluate((node) => node.getBoundingClientRect().bottom <= innerHeight + 1)).toBeTruthy();
  await page.getByRole('button', { name: 'Zavřít dialog' }).click();
  await cards.first().click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Uklizeno/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Obnovit stav' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Uklizeno/ })).toBeEnabled();
});

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = getAdminCredentials();
const ADMIN_EMAIL_LABEL = /e-mail administrátora/i;

async function csrfHeaderFor(context: APIRequestContext) {
  const state = await context.storageState();
  const csrf = state.cookies.find((cookie: { name: string; value: string }) => cookie.name === 'kajovo_csrf')?.value;
  expect(csrf, 'Expected CSRF cookie after login').toBeTruthy();
  return { 'x-csrf-token': csrf! };
}

test.describe('CI smoke auth flows', () => {
  test('admin login + hint email + user create + portal login', async ({ request }) => {
    const adminLoginResponse = await request.post('/api/auth/admin/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(adminLoginResponse.ok()).toBeTruthy();
    await expect(adminLoginResponse.json()).resolves.toMatchObject({
      email: ADMIN_EMAIL,
      actor_type: 'admin',
      role: 'admin',
    });

    const csrfHeaders = await csrfHeaderFor(request);

    const hintResponse = await request.post('/api/auth/admin/hint', {
      data: { email: ADMIN_EMAIL },
      headers: csrfHeaders,
    });
    expect(hintResponse.ok()).toBeTruthy();
    const hintBody = await hintResponse.json();
    expect(hintBody.ok).toBeTruthy();
    expect(typeof hintBody.connected).toBe('boolean');
    expect(typeof hintBody.send_attempted).toBe('boolean');

    const suffix = `${Date.now()}`;
    const userEmail = `smoke+${suffix}@kajovohotel.local`;
    const userPassword = `Smoke-${suffix}-pass`;

    const createUserResponse = await request.post('/api/v1/users', {
      data: {
        email: userEmail,
        password: userPassword,
        first_name: 'Smoke',
        last_name: 'User',
        roles: ['recepce'],
      },
      headers: csrfHeaders,
    });
    expect(createUserResponse.status()).toBe(201);
    await expect(createUserResponse.json()).resolves.toMatchObject({
      email: userEmail,
      is_active: true,
    });

    const portalLoginResponse = await request.post('/api/auth/login', {
      data: { email: userEmail, password: userPassword },
    });
    expect(portalLoginResponse.ok()).toBeTruthy();
    await expect(portalLoginResponse.json()).resolves.toMatchObject({
      email: userEmail,
      actor_type: 'portal',
    });
  });

  test('admin profil uz nenabizi zmenu hesla', async ({ page, request }) => {
    const adminLoginResponse = await request.post('/api/auth/admin/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(adminLoginResponse.ok()).toBeTruthy();

    const storageState = await request.storageState();
    await page.context().addCookies(storageState.cookies);

    await page.goto('/admin/', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: /profil/i }).click();
    await expect(page.getByTestId('admin-profile-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: /profil administrátora/i })).toBeVisible();
    await expect(page.getByText(/admin účet nemá reset hesla/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /změna hesla/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /změnit heslo/i })).toHaveCount(0);
  });

  test('admin vidí pokojský přehled a může změnit stav pokoje', async ({ page, request }) => {
    const adminLoginResponse = await request.post('/api/auth/admin/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(adminLoginResponse.ok()).toBeTruthy();
    const storageState = await request.storageState();
    await page.context().addCookies(storageState.cookies);
    let patchBody: unknown = null;
    let finishWrite: (() => void) | undefined;
    const pendingWrite = new Promise<void>((resolve) => { finishWrite = resolve; });
    const room = {
      room_id: 'room-301', room_number: '301', room_name: '301 KOMFORT', floor: '3',
      housekeeping_status_id: 'dirty-id', housekeeping_status: 'Neuklizeno', housekeeping_color: '#F57621',
      operational_state: 'checkout_pending', arrival_today: false, departure_today: true,
      occupancy_state: 'departing', departures: [], arrivals: [], stays: [],
      checked_out: false, occupied: false, guest_label: 'Novák', persons: 1,
    };
    await page.route('**/api/v1/housekeeping/rooms**', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchBody = route.request().postDataJSON();
        await pendingWrite;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...room, housekeeping_status: 'Technický problém', housekeeping_status_id: 'technical-id' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          date: new URL(route.request().url()).searchParams.get('date'),
          occupancy_date: new URL(route.request().url()).searchParams.get('date'),
          housekeeping_status_is_current: true,
          loaded_at: '2026-09-17T12:00:00Z',
          rooms: [{ ...room, housekeeping_status: patchBody ? 'Technický problém' : room.housekeeping_status }],
        }),
      });
    });
    await page.goto('/admin/pokojska', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('housekeeping-rooms-view')).toBeVisible();
    await page.getByRole('button', { name: /pokoj 301/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Technická závada /i }).click();
    await expect(dialog).toContainText('Zapisuji změnu');
    await expect(dialog.getByRole('button')).toHaveCount(0);
    finishWrite!();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: /pokoj 301/i })).toContainText('Technický problém');
    expect(patchBody).toEqual({ status: 'technical_issue' });
  });

  test('admin mění dietu celého pobytu bez přepsání ostatních příznaků', async ({ page, request }) => {
    const login = await request.post('/api/auth/admin/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    expect(login.ok()).toBeTruthy();
    await page.context().addCookies((await request.storageState()).cookies);
    const reservation = { reservation_id: 'stay-a', guest_name: 'Host', arrival: '2026-09-15', departure: '2026-09-19', diet_no_gluten: false, diet_no_milk: false, diet_no_pork: true, version: 1 };
    await page.route('**/api/v1/breakfast/daily-overview?*', async (route) => {
      const day = new URL(route.request().url()).searchParams.get('service_date');
      await route.fulfill({ json: { orders: [{ id: 900, service_date: day, room_number: '101', guest_name: 'Host', guest_count: 1, status: 'pending', note: null, reservations: [reservation] }], summary: { service_date: day, total_orders: 1, total_guests: 1, status_counts: { pending: 1 } } } });
    });
    await page.route('**/api/v1/breakfast/900/reservations/stay-a/diet', async (route) => {
      expect(route.request().postDataJSON()).toEqual({ kind: 'diet_no_milk', enabled: true, version: 1 });
      reservation.diet_no_milk = true;
      reservation.version = 2;
      await route.fulfill({ json: { id: 900, reservations: [reservation] } });
    });
    await page.goto('/admin/snidane');
    await expect(page.locator('.k-breakfast-reservation-diets')).toHaveCount(2);
    if (await page.getByTestId('breakfast-serving-mobile-list').isVisible()) await page.getByText('Diety pobytu', { exact: true }).click();
    const controls = page.locator('.k-breakfast-reservation-diets:visible');
    await controls.getByRole('button', { name: 'Bez laktózy', exact: true }).click();
    await expect(controls.getByRole('button', { name: 'Bez laktózy', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(reservation.diet_no_pork).toBe(true);
  });

  test('admin login hint zobrazi blokujici dialog az do potvrzeni odeslani', async ({ page }) => {
    await page.goto('/admin/login', { waitUntil: 'networkidle' });
    await page.getByLabel(ADMIN_EMAIL_LABEL).fill(ADMIN_EMAIL);
    await page.getByRole('button', { name: /zapomenuté heslo/i }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/připomenutí bylo odesláno|odeslání připomenutí selhalo/i);
  });
});
