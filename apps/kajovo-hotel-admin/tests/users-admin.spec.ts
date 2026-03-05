import { expect, test, type Page, type Route } from '@playwright/test';

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

test('správa uživatelů validuje vstupy a prefixuje +420', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('kajovo_admin_role_view', 'admin');
  });
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['users:read', 'users:write'],
    actor_type: 'admin',
  });

  let createdPayload: Record<string, unknown> | null = null;
  await page.route('**/api/v1/users', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (method === 'POST') {
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
});

test('mazání uživatelů je dostupné pouze v admin view', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('kajovo_admin_role_view', 'sklad');
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
  await page.getByRole('button', { name: 'Upravit' }).click();

  await expect(page.getByText('Smazání je dostupné pouze pro admina.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Smazat' })).toHaveCount(0);
});
