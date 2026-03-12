import { expect, test, type Page, type Route } from '@playwright/test';
import { getAdminCredentials } from '../test-admin-credentials';

const { email: ADMIN_EMAIL } = getAdminCredentials();

const adminPath = (path: string): string => {
  if (path.startsWith('/admin')) {
    return path;
  }
  return `/admin${path.startsWith('/') ? '' : '/'}${path}`;
};

type AuthPayload = {
  email: string;
  role: string;
  permissions: string[];
  actor_type: 'admin' | 'portal';
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


test('admin login shows structured error dialog for invalid and locked credentials', async ({ page }) => {
  await page.route('**/api/auth/admin/login', async (route) => {
    const payload = route.request().postDataJSON() as { password?: string };
    if (payload.password === 'locked-pass') {
      await route.fulfill({
        status: 423,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Account locked' }),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Invalid credentials' }),
    });
  });

  await page.goto(adminPath('/login'));
  await page.locator('#admin_login_email').fill(ADMIN_EMAIL);
  await page.locator('#admin_login_password').fill('wrong-password');
  await page.getByRole('button', { name: 'Přihlásit' }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /Přihlášení se nezdařilo/i })).toBeVisible();
  await expect(dialog).toContainText(/Zkontrolujte email a heslo/i);

  await page.locator('#admin_login_password').fill('locked-pass');
  await page.getByRole('button', { name: 'Přihlásit' }).click();
  await expect(dialog).toContainText(/Účet je dočasně uzamčen/i);
});

test('správa uživatelů validuje vstupy a prefixuje +420', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('kajovo_admin_role_view', 'admin');
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['users:read', 'users:write'],
    actor_type: 'admin',
  });

  let createdPayload: Record<string, unknown> | null = null;
  let csrfHeader: string | undefined;

  await page.route('**/api/v1/users', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (method === 'POST') {
      csrfHeader = route.request().headers()['x-csrf-token'];
      createdPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          first_name: 'Eva',
          last_name: 'Nová',
          email: 'eva.nova@example.com',
          role: 'recepce',
          roles: ['recepce', 'sklad'],
          phone: '+420777888999',
          note: null,
          is_active: true,
          created_at: null,
          updated_at: null,
          last_login_at: null,
        }),
      });
      return;
    }
    await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
  });

  await page.goto(adminPath('/uzivatele'));

  await page.locator('#create_email').fill('neplatny-email');
  await expect(page.getByText('Neplatný email.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vytvořit uživatele' })).toBeDisabled();

  await page.locator('#create_first_name').fill('Eva');
  await page.locator('#create_last_name').fill('Nová');
  await page.locator('#create_email').fill('eva.nova@example.com');
  await page.locator('#create_password').fill('TempPass123');
  await page.locator('#create_phone').fill('777888999');

  await expect(page.locator('#create_phone')).toHaveValue('+420777888999');
  await page.getByLabel('Recepce').check();
  await page.getByLabel('Sklad').check();

  const createButton = page.getByRole('button', { name: 'Vytvořit uživatele' });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  expect(createdPayload).toMatchObject({
    email: 'eva.nova@example.com',
    roles: ['recepce', 'sklad'],
    phone: '+420777888999',
  });
  expect(csrfHeader).toBe('test-token');
});

test('mazání uživatelů je dostupné pouze v admin view', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('kajovo_admin_role_view', 'sklad');
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['users:read', 'users:write'],
    actor_type: 'admin',
  });

  await page.route('**/api/v1/users', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 12,
          first_name: 'Karel',
          last_name: 'Novák',
          email: 'karel.novak@example.com',
          role: 'recepce',
          roles: ['recepce'],
          phone: null,
          note: null,
          is_active: true,
          created_at: null,
          updated_at: null,
          last_login_at: null,
        },
      ]),
    });
  });

  await page.goto(adminPath('/uzivatele'));
  const rowActivator = page.getByRole('button', { name: 'Karel' });
  await rowActivator.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await rowActivator.click({ force: true });

  await expect(page.getByText('Smazání je dostupné pouze pro admina.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Smazat' })).toHaveCount(0);
});

test('seznam uživatelů lze filtrovat podle jména, emailu i role', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('kajovo_admin_role_view', 'admin');
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['users:read', 'users:write'],
    actor_type: 'admin',
  });

  await page.route('**/api/v1/users', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          first_name: 'Jana',
          last_name: 'Recepční',
          email: 'jana.recepcni@example.com',
          role: 'recepce',
          roles: ['recepce'],
          phone: null,
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
          role: 'sklad',
          roles: ['sklad'],
          phone: null,
          note: null,
          is_active: false,
          created_at: null,
          updated_at: null,
          last_login_at: null,
        },
      ]),
    });
  });

  await page.goto(adminPath('/uzivatele'));

  const usersPage = page.getByTestId('users-admin-page');
  const listTable = usersPage.locator('table').first();
  await expect(listTable).toContainText('jana.recepcni@example.com');
  await expect(listTable).toContainText('karel.skladnik@example.com');

  const filterInput = page.getByPlaceholder('Hledat jméno, email nebo roli');
  await expect(filterInput).toBeVisible();

  await filterInput.fill('sklad');
  await expect(listTable).toContainText('karel.skladnik@example.com');
  await expect(listTable).not.toContainText('jana.recepcni@example.com');

  await filterInput.fill('recepční');
  await expect(listTable).toContainText('jana.recepcni@example.com');
  await expect(listTable).not.toContainText('karel.skladnik@example.com');

  await filterInput.fill('');
  await expect(listTable).toContainText('jana.recepcni@example.com');
  await expect(listTable).toContainText('karel.skladnik@example.com');
});

test('admin smaže uživatele přes potvrzovací dialog', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('kajovo_admin_role_view', 'admin');
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['users:read', 'users:write'],
    actor_type: 'admin',
  });

  type MockUser = {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    roles: string[];
    phone: string | null;
    note: string | null;
    is_active: boolean;
    created_at: string | null;
    updated_at: string | null;
    last_login_at: string | null;
  };

  let users: MockUser[] = [
    {
      id: 12,
      first_name: 'Karel',
      last_name: 'Novák',
      email: 'karel.novak@example.com',
      role: 'recepce',
      roles: ['recepce'],
      phone: null,
      note: null,
      is_active: true,
      created_at: null,
      updated_at: null,
      last_login_at: null,
    },
    {
      id: 13,
      first_name: 'Jana',
      last_name: 'Skladníková',
      email: 'jana.skladnikova@example.com',
      role: 'sklad',
      roles: ['sklad'],
      phone: null,
      note: null,
      is_active: true,
      created_at: null,
      updated_at: null,
      last_login_at: null,
    },
  ];

  let deleteCsrfHeader: string | undefined;

  await page.route('**/api/v1/users', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(users),
      });
      return;
    }
    await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/v1/users/*', async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      deleteCsrfHeader = route.request().headers()['x-csrf-token'];
      const url = new URL(route.request().url());
      const id = Number(url.pathname.split('/').pop());
      users = users.filter((user) => user.id !== id);
      await route.fulfill({ status: 204, contentType: 'application/json', body: '' });
      return;
    }
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(users),
      });
      return;
    }
    await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
  });

  await page.goto(adminPath('/uzivatele'));

  const rowActivator = page.getByRole('button', { name: 'Karel' });
  await rowActivator.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await rowActivator.click({ force: true });

  const deleteButton = page.locator('#users-detail').getByRole('button', { name: 'Smazat' });
  await expect(deleteButton).toBeVisible();
  await deleteButton.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => window.scrollBy(0, 120));
  await deleteButton.evaluate((node: HTMLButtonElement) => node.click());

  const confirmCard = page.getByTestId('confirm-delete-card');
  await expect(confirmCard).toBeVisible();
  await expect(confirmCard).toContainText('karel.novak@example.com');

  await confirmCard.getByRole('button', { name: 'Smazat' }).click({ force: true });

  await expect(confirmCard).toHaveCount(0);
  await expect(page.getByText('Uživatel byl smazán.')).toBeVisible();

  const table = page.getByTestId('users-admin-page').locator('table').first();
  await expect(table).not.toContainText('karel.novak@example.com');
  await expect(table).toContainText('jana.skladnikova@example.com');

  expect(deleteCsrfHeader).toBe('test-token');
});
