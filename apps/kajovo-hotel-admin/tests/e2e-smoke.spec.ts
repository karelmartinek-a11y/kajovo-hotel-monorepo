import { expect, test, type APIRequestContext } from '@playwright/test';
import { getAdminCredentials } from '../test-admin-credentials';

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
    await expect(dialog).toContainText('Technický problém');
    expect(patchBody).toEqual({ status: 'technical_issue' });
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
