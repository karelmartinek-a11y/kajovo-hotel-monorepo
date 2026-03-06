import { expect, test, type Page } from '@playwright/test';

const adminPath = (path: string): string => {
  if (path.startsWith('/')) {
    return `/admin${path}`;
  }
  return `/admin${path.startsWith('/') ? '' : '/'}${path}`;
};

const mockAdminProfile = {
  email: 'admin@example.com',
  role: 'admin',
  permissions: ['users:read', 'users:write'],
  actor_type: 'admin',
};

async function mockAuth(page: Page, profile = mockAdminProfile): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(profile),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('kajovo_admin_role_view', 'admin');
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });
});

test('admin can create a user via the admin panel', async ({ page }) => {
  await mockAuth(page);

  let createdPayload: Record<string, unknown> | null = null;
  let csrfHeader: string | undefined;

  await page.route('**/api/v1/users', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
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
          last_name: 'Krejčí',
          email: 'eva.krejci@example.com',
          role: 'recepce',
          roles: ['recepce'],
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

  await page.getByLabel('Jméno').fill('Eva');
  await page.getByLabel('Příjmení').fill('Krejčí');
  await page.getByLabel('Email').fill('eva.krejci@example.com');
  await page.getByLabel('Dočasné heslo').fill('TempPass123');
  await page.getByLabel('Telefon (E.164, volitelný)').fill('777888999');
  await page.getByLabel('Recepce').check();
  await page.getByRole('button', { name: 'Vytvořit uživatele' }).click();

  await expect(page.getByText('Uživatel byl vytvořen.')).toBeVisible();
  await expect(page.getByText('eva.krejci@example.com')).toBeVisible();

  expect(createdPayload).toMatchObject({
    email: 'eva.krejci@example.com',
    roles: ['recepce'],
    phone: '+420777888999',
  });
  expect(csrfHeader).toBe('test-token');
});

test('admin deletes a user through the confirmation dialog and sees the list refreshed', async ({ page }) => {
  await mockAuth(page);

  const users = [
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
      last_name: 'Veselá',
      email: 'jana.vesela@example.com',
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
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(users),
    });
  });

  await page.route('**/api/v1/users/*', async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      deleteCsrfHeader = route.request().headers()['x-csrf-token'];
      const url = new URL(route.request().url());
      const id = Number(url.pathname.split('/').pop());
      const index = users.findIndex((user) => user.id === id);
      if (index !== -1) {
        users.splice(index, 1);
      }
      await route.fulfill({ status: 204, contentType: 'application/json', body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(users),
    });
  });

  await page.goto(adminPath('/uzivatele'));

  await page.getByRole('button', { name: 'Karel' }).click();
  const deleteButton = page.getByTestId('users-admin-page').getByRole('button', { name: 'Smazat' });
  await deleteButton.click();

  const dialog = page.getByTestId('confirm-delete-card');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('karel.novak@example.com');

  await dialog.getByRole('button', { name: 'Smazat' }).click();

  await expect(page.getByText('Uživatel byl smazán.')).toBeVisible();
  const table = page.getByTestId('users-admin-page').locator('table').first();
  await expect(table).not.toContainText('karel.novak@example.com');
  await expect(table).toContainText('jana.vesela@example.com');
  expect(deleteCsrfHeader).toBe('test-token');
});

test('authorization error from delete endpoint surfaces to the user', async ({ page }) => {
  await mockAuth(page);

  const users = [
    {
      id: 99,
      first_name: 'Zdeněk',
      last_name: 'Malý',
      email: 'zdenek.maly@example.com',
      role: 'recepce',
      roles: ['recepce'],
      phone: null,
      note: null,
      is_active: true,
      created_at: null,
      updated_at: null,
      last_login_at: null,
    },
  ];

  await page.route('**/api/v1/users', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(users),
    });
  });

  await page.route('**/api/v1/users/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Nemáte oprávnění smazat tohoto uživatele.' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(users),
    });
  });

  await page.goto(adminPath('/uzivatele'));

  await page.getByRole('button', { name: 'Zdeněk' }).click();
  await page.getByRole('button', { name: 'Smazat' }).click();
  await page.getByTestId('confirm-delete-card').getByRole('button', { name: 'Smazat' }).click();

  await expect(page.getByText('Nemáte oprávnění smazat tohoto uživatele.')).toBeVisible();
});
