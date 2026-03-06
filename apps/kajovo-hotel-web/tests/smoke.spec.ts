import { expect, test, type Page, type Route } from '@playwright/test';

type PortalUser = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  roles: string[];
  role: string;
  phone: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
};

test.describe('admin smoke flows', () => {
  const adminIdentity = {
    email: 'admin@kajovohotel.local',
    role: 'admin',
    permissions: [
      'users:read',
      'users:write',
      'admin:read',
      'admin:write',
    ],
    actor_type: 'admin' as const,
  };

  const unauthorizedIdentity = {
    email: 'recepce@example.com',
    role: 'recepce',
    permissions: ['breakfast:read', 'lost_found:read'],
    actor_type: 'portal' as const,
  };

  const seedUsers: PortalUser[] = [
    {
      id: 1,
      first_name: 'Karel',
      last_name: 'Novák',
      email: 'karel.novak@example.com',
      roles: ['recepce'],
      role: 'recepce',
      phone: '+420777111222',
      note: null,
      is_active: true,
      created_at: null,
      updated_at: null,
      last_login_at: null,
    },
    {
      id: 2,
      first_name: 'Jana',
      last_name: 'Veselá',
      email: 'jana.vesela@example.com',
      roles: ['sklad'],
      role: 'sklad',
      phone: null,
      note: null,
      is_active: true,
      created_at: null,
      updated_at: null,
      last_login_at: null,
    },
  ];

  async function autorouteAuth(page: Page, identity: typeof adminIdentity | typeof unauthorizedIdentity) {
    await page.route('**/api/auth/me', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(identity),
      });
    });
  }

  test('admin login and user lifecycle works', async ({ page }) => {
    let users = [...seedUsers];
    let nextId = users.length + 1;

    await page.route('**/api/auth/admin/login', async (route) => {
      await route.fulfill({ status: 200 });
    });

    await autorouteAuth(page, adminIdentity);

    await page.route('**/api/v1/users', async (route: Route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(users),
        });
        return;
      }
      if (method === 'POST') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        const roles = Array.isArray(payload.roles) ? payload.roles.map(String) : ['recepce'];
        const user: PortalUser = {
          id: nextId++,
          first_name: String(payload.first_name ?? 'Novy'),
          last_name: String(payload.last_name ?? 'Uzivatel'),
          email: String(payload.email ?? `generated${nextId}@kajovo.local`),
          roles,
          role: roles[0] ?? 'recepce',
          phone: (payload.phone as string) ?? null,
          note: (payload.note as string) ?? null,
          is_active: true,
          created_at: null,
          updated_at: null,
          last_login_at: null,
        };
        users = [...users, user];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(user),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/v1/users/*', async (route: Route) => {
      if (route.request().method() === 'DELETE') {
        const id = Number(route.request().url().split('/').pop() ?? '0');
        users = users.filter((item) => item.id !== id);
        await route.fulfill({ status: 204 });
        return;
      }
      await route.continue();
    });

    await page.goto('/admin/login');
    await page.getByLabel(/email/i).fill('admin@kajovohotel.local');
    await page.getByLabel(/heslo/i).fill('admin123');
    await page.getByRole('button', { name: /přihlásit/i }).click();
    await page.waitForURL('**/admin/**');

    await page.goto('/admin/uzivatele');
    await expect(page.getByText('karel.novak@example.com')).toBeVisible();

    const createForm = page.locator('#users-create');
    await createForm.getByLabel(/Jméno/i).fill('Nova');
    await createForm.getByLabel(/Příjmení/i).fill('Testova');
    await createForm.getByLabel(/Email/i).fill('nova.testova@example.com');
    await createForm.getByLabel(/Dočasné heslo/i).fill('TempPass123');
    await createForm.getByLabel(/Telefon/i).fill('601123456');
    await createForm.getByLabel(/Recepce/i).check();
    await page.getByRole('button', { name: /Vytvořit uživatele/i }).click();

    await expect(page.getByText('Uživatel byl vytvořen.')).toBeVisible();
    await expect(page.getByText('nova.testova@example.com')).toBeVisible();

    await page.getByRole('button', { name: /Smazat/i }).first().click();
    const dialog = page.getByTestId('confirm-delete-card');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Smazat/i }).click();

    await expect(page.getByText('Uživatel byl smazán.')).toBeVisible();
    await expect(page.getByText('nova.testova@example.com')).toHaveCount(0);
  });

  test('portal user sees blocked message in users admin', async ({ page }) => {
    await autorouteAuth(page, unauthorizedIdentity);

    await page.route('**/api/v1/users', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Missing permission: users:read' }),
      });
    });

    await page.goto('/admin/uzivatele');
    await expect(page.getByText(/Nemáte oprávnění/)).toBeVisible();
  });
});
