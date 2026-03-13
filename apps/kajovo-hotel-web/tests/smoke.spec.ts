import { expect, test, type Page, type Route } from '@playwright/test';
import { getAdminCredentials } from '../test-admin-credentials';

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = getAdminCredentials();

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
    email: ADMIN_EMAIL,
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
  });
}

test.describe('web admin retirement smoke', () => {
  test('admin login path shows deprecation gateway instead of embedded login form', async ({ page }) => {
    await mockAuth(page, 401, { detail: 'Not authenticated' });

    await page.goto('/admin/login');
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/heslo/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /přihlásit/i }).click();
    await page.waitForURL('**/admin/**');

    await gotoWithAbortRetry(page, '/admin/uzivatele');
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

    const createdRow = page.getByRole('button', { name: 'Nova' });
    await createdRow.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await createdRow.click({ force: true });

    const deleteButton = page.locator('#users-detail').getByRole('button', { name: /Smazat/i });
    await expect(deleteButton).toBeVisible();
    await deleteButton.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await page.evaluate(() => window.scrollBy(0, 120));
    await deleteButton.evaluate((node: HTMLButtonElement) => node.click());

    const dialog = page.getByTestId('confirm-delete-card');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Smazat/i }).click({ force: true });

    await expect(page.getByText('Uživatel byl smazán.')).toBeVisible();
    await expect(page.getByText('nova.testova@example.com')).toHaveCount(0);
  });

  test('authenticated admin hitting web root is redirected away from portal runtime', async ({ page }) => {
    await mockAuth(page, 200, {
      email: 'admin@kajovohotel.local',
      role: 'admin',
      permissions: ['users:read', 'users:write'],
      actor_type: 'admin',
    });

    await page.goto('/');

    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByTestId('admin-surface-retired-page')).toBeVisible();
  });
});
