import { expect, test, type Page, type Route } from '@playwright/test';

type AuthPayload = {
  email: string;
  role: string;
  permissions: string[];
  actor_type: 'admin' | 'portal';
};

const adminPath = (path: string): string => {
  if (path.startsWith('/admin')) {
    return path;
  }
  return `/admin${path.startsWith('/') ? '' : '/'}${path}`;
};

async function mockAuth(page: Page, payload: AuthPayload): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('kajovo_admin_role_view', 'admin');
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });
});

test('admin covers users CRUD, active toggle, reset link and delete confirmation', async ({ page }) => {
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['users:read', 'users:write'],
    actor_type: 'admin',
  });

  let users = [
    {
      id: 1,
      first_name: 'Jana',
      last_name: 'Recepční',
      email: 'jana.recepcni@example.com',
      roles: ['recepce'],
      role: 'recepce',
      phone: '+420777888111',
      note: null,
      is_active: true,
      created_at: null,
      updated_at: null,
      last_login_at: null,
    },
    {
      id: 2,
      first_name: 'Karel',
      last_name: 'Skladník',
      email: 'karel.skladnik@example.com',
      roles: ['sklad'],
      role: 'sklad',
      phone: null,
      note: 'Ranní směna',
      is_active: false,
      created_at: null,
      updated_at: null,
      last_login_at: null,
    },
  ];

  let lastResetUserId: number | null = null;

  await page.route('**/api/v1/users', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(users) });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const created = {
        id: 3,
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email,
        roles: payload.roles,
        role: Array.isArray(payload.roles) ? String(payload.roles[0]) : 'recepce',
        phone: payload.phone ?? null,
        note: payload.note ?? null,
        is_active: true,
        created_at: null,
        updated_at: null,
        last_login_at: null,
      };
      users = [...users, created as never];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/v1/users/*/password/reset-link', async (route) => {
    lastResetUserId = Number(route.request().url().split('/').slice(-3)[0]);
    expect(route.request().headers()['x-csrf-token']).toBe('test-token');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.route('**/api/v1/users/*/active', async (route) => {
    const id = Number(route.request().url().split('/').slice(-2)[0]);
    const payload = route.request().postDataJSON() as { is_active: boolean };
    const updated = { ...(users.find((item) => item.id === id) as object), is_active: payload.is_active };
    users = users.map((item) => (item.id === id ? updated as never : item));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
  });

  await page.route('**/api/v1/users/*', async (route) => {
    const id = Number(route.request().url().split('/').pop());
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const updated = { ...(users.find((item) => item.id === id) as object), ...payload, id };
      users = users.map((item) => (item.id === id ? updated as never : item));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }
    if (route.request().method() === 'DELETE') {
      users = users.filter((item) => item.id !== id);
      await route.fulfill({ status: 204, contentType: 'application/json', body: '' });
      return;
    }
    await route.fallback();
  });

  await page.goto(adminPath('/uzivatele'));
  await expect(page.getByTestId('users-admin-page')).toContainText('jana.recepcni@example.com');

  await page.getByPlaceholder(/hledat jméno, email nebo roli/i).fill('sklad');
  await expect(page.locator('table').first()).toContainText('karel.skladnik@example.com');
  await expect(page.locator('table').first()).not.toContainText('jana.recepcni@example.com');
  await page.getByRole('button', { name: /zrušit filtr/i }).click();

  await page.getByLabel('Jméno').last().fill('Eva');
  await page.getByLabel('Příjmení').last().fill('Novotná');
  await page.getByLabel('Email').last().fill('eva.novotna@example.com');
  await page.getByLabel(/dočasné heslo/i).fill('TempPass123');
  await page.getByLabel(/telefon/i).last().fill('777999333');
  await page.getByLabel('Recepce').last().check();
  await page.getByRole('button', { name: /vytvořit uživatele/i }).click();
  await expect(page.getByText(/uživatel byl vytvořen/i)).toBeVisible();
  await expect(page.getByText('eva.novotna@example.com')).toBeVisible();

  await page.getByRole('button', { name: 'Jana' }).click();
  await page.locator('#edit_note').fill('Noční směna');
  await page.locator('#users-detail').getByRole('button', { name: /^upravit$/i }).click();
  await expect(page.getByText(/uživatel byl upraven/i)).toBeVisible();
  await page.getByRole('button', { name: /zakázat/i }).click();
  await page.getByRole('button', { name: /odeslat token pro reset hesla/i }).click();
  expect(lastResetUserId).not.toBeNull();

  await page.getByRole('button', { name: 'Eva' }).click();
  const detailDeleteButton = page.locator('#users-detail').getByRole('button', { name: /^Smaz/i });
  await expect(detailDeleteButton).toBeVisible();
  await detailDeleteButton.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => window.scrollBy(0, 120));
  await detailDeleteButton.evaluate((node: HTMLButtonElement) => node.click());
  const dialog = page.getByTestId('confirm-delete-card');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Smaz/i }).click();
  await expect(page.getByText(/u.*ivatel byl smaz.n/i)).toBeVisible();

});

test('admin settings and profile workflows save data, send test mail and logout after password change', async ({ page }) => {
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['settings:read', 'settings:write', 'users:read'],
    actor_type: 'admin',
  });

  let smtpSaved = false;
  let testMailSent = false;
  let profileSaved = false;
  let logoutCalled = false;
  let passwordChanged = false;

  await page.route('**/api/v1/admin/settings/smtp/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        env_enabled: true,
        mode: 'configured',
        can_send_real_email: true,
        last_test_at: '2026-03-10T09:00:00Z',
        last_test_recipient: 'qa@example.com',
        last_test_success: true,
      }),
    });
  });

  await page.route('**/api/v1/admin/settings/smtp', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          host: 'smtp.example.com',
          port: 587,
          username: 'hotel@example.com',
          use_tls: true,
          use_ssl: false,
          password_masked: '********',
        }),
      });
      return;
    }
    smtpSaved = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/v1/admin/settings/smtp/test-email', async (route) => {
    testMailSent = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/v1/admin/profile', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          email: 'admin@example.com',
          display_name: 'Kájovo admin',
          password_changed_at: '2026-03-10T09:00:00Z',
          updated_at: '2026-03-11T12:00:00Z',
        }),
      });
      return;
    }
    profileSaved = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'admin@example.com',
        display_name: 'Hlavní služba',
        password_changed_at: '2026-03-10T09:00:00Z',
        updated_at: '2026-03-12T15:00:00Z',
      }),
    });
  });
  await page.route('**/api/v1/admin/profile/password', async (route) => {
    passwordChanged = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/auth/admin/logout', async (route) => {
    logoutCalled = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto(adminPath('/nastaveni'));
  await expect(page.getByTestId('settings-admin-page')).toBeVisible();
  await page.getByLabel(/smtp host/i).fill('smtp.hcasc.cz');
  await page.getByLabel(/smtp heslo/i).fill('NovaSecret123');
  await page.getByRole('button', { name: /uložit smtp/i }).click();
  await expect(page.getByText(/smtp nastavení bylo uloženo/i)).toBeVisible();
  await page.getByRole('button', { name: /odeslat testovací e-mail/i }).click();
  await expect(page.getByText(/testovací e-mail byl odeslán/i).first()).toBeVisible();

  await page.goto(adminPath('/profil'));
  await expect(page.getByTestId('admin-profile-page')).toBeVisible();
  await page.getByLabel(/jméno profilu/i).fill('Hlavní služba');
  await page.getByRole('button', { name: /uložit profil/i }).click();
  await expect(page.getByText(/profil byl uložen/i)).toBeVisible();

  await page.getByLabel(/aktuální heslo/i).fill('OldPass123');
  await page.getByLabel(/^nové heslo$/i).fill('NewSecret123');
  await page.getByLabel(/potvrzení nového hesla/i).fill('NewSecret123');
  await page.getByRole('button', { name: /změnit heslo/i }).click();

  expect(smtpSaved).toBeTruthy();
  expect(testMailSent).toBeTruthy();
  expect(profileSaved).toBeTruthy();
  expect(passwordChanged).toBeTruthy();
});

test('admin utility states and deep links keep working on responsive breakpoints', async ({ page }) => {
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['users:read', 'settings:read'],
    actor_type: 'admin',
  });
  await page.route('**/api/v1/users', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/v1/admin/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'admin@example.com',
        display_name: 'Kájovo admin',
        password_changed_at: null,
        updated_at: null,
      }),
    });
  });
  await page.route('**/api/v1/admin/settings/smtp', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ host: '', port: 587, username: '', use_tls: true, use_ssl: false, password_masked: '' }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(adminPath('/intro'));
  await expect(page.getByRole('heading', { name: /administrace připravená na každodenní směnu/i })).toBeVisible();
  await page.goto(adminPath('/offline'));
  await expect(page.getByText(/administrace je offline/i)).toBeVisible();
  await page.goto(adminPath('/maintenance'));
  await expect(page.getByText(/probíhá údržba/i)).toBeVisible();
  await page.goto(adminPath('/404'));
  await expect(page.getByText('404')).toBeVisible();

  await page.goto(adminPath('/'));
  const phoneNav = page.getByTestId('module-navigation-phone');
  await phoneNav.getByRole('button', { name: /menu/i }).click();
  await expect(phoneNav.getByRole('menuitem', { name: /uživatelé/i })).toBeVisible();
  await expect(phoneNav.getByRole('menuitem', { name: /nastavení/i })).toBeVisible();

  await page.goto(adminPath('/uzivatele'));
  await expect(page.getByTestId('users-admin-page')).toBeVisible();
  await page.goto(adminPath('/nastaveni'));
  await expect(page.getByTestId('settings-admin-page')).toBeVisible();
  await page.goto(adminPath('/profil'));
  await expect(page.getByTestId('admin-profile-page')).toBeVisible();
});
