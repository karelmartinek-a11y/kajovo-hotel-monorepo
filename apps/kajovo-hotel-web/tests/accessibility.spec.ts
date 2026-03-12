import { expect, test, type Page } from '@playwright/test';

type EnvMap = Record<string, string | undefined>;

const readEnv = (key: string): string | undefined =>
  (globalThis as { process?: { env?: EnvMap } }).process?.env?.[key];

const ADMIN_EMAIL = readEnv('KAJOVO_API_ADMIN_EMAIL') ?? readEnv('HOTEL_ADMIN_EMAIL') ?? 'admin@kajovohotel.local';

const adminPath = (path: string): string => {
  if (path.startsWith('/')) {
    return `/admin${path}`;
  }
  return `/admin/${path}`;
};

type AuthPayload = {
  email: string;
  role: string;
  permissions: string[];
  actor_type: 'admin' | 'portal';
};

async function mockAdminAuth(page: Page, payload: AuthPayload = {
  email: 'admin@example.com',
  role: 'admin',
  permissions: ['users:read', 'users:write'],
  actor_type: 'admin',
}): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

test('admin login uses descriptive labels and exposes status text', async ({ page }) => {
  await page.goto('/admin/login');

  const emailInput = page.getByLabel(/email/i);
  const passwordInput = page.getByLabel(/heslo/i);

  await expect(emailInput).toHaveAttribute('aria-describedby', 'admin-login-description');
  await expect(passwordInput).toHaveAttribute('aria-describedby', 'admin-login-description');

  await emailInput.fill('foo@example.com');
  await passwordInput.fill('secret123');

  await expect(page.getByRole('button', { name: /přihlásit/i })).toBeEnabled();
});

test('skip link moves focus to main content and navigation is focusable', async ({ page }) => {
  await mockAdminAuth(page);
  await page.route('**/api/v1/users', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.goto(adminPath('/'));
  const skipLink = page.locator('.k-skip-link');
  await skipLink.focus();
  await skipLink.press('Enter');
  const activeElementId = await page.evaluate(() => document.activeElement?.id);
  expect(activeElementId).toBe('main-content');

  const nav = page.locator('nav[role="navigation"]');
  await expect(nav).toHaveAttribute('aria-label', /navigace/i);
});

test('user form helper text is referenced by aria-describedby', async ({ page }) => {
  await mockAdminAuth(page);
  const userRecord = [
    {
      id: 1,
      first_name: 'Test',
      last_name: 'Uživatel',
      email: 'test@example.com',
      roles: ['recepce'],
      role: 'recepce',
      phone: null,
      note: null,
      is_active: true,
      created_at: null,
      updated_at: null,
      last_login_at: null,
    },
  ];
  await page.route('**/api/v1/users', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(userRecord),
      });
      return;
    }
    await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
  });

  await page.goto(adminPath('/uzivatele'));
  const editPhone = page.locator('#edit_phone');
  await expect(editPhone).toHaveAttribute('aria-describedby', 'users-edit-phone-help');
  const createPhone = page.locator('#create_phone');
  await expect(createPhone).toHaveAttribute('aria-describedby', 'users-create-phone-help');
  const editNote = page.locator('#edit_note');
  await expect(editNote).toHaveAttribute('aria-describedby', 'users-edit-note-help');
  const createNote = page.locator('#create_note');
  await expect(createNote).toHaveAttribute('aria-describedby', 'users-create-note-help');
});


test('admin login renders structured error dialog on invalid and locked credentials', async ({ page }) => {
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

  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/heslo/i).fill('wrong-password');
  await page.getByRole('button', { name: /přihlásit/i }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /přihlášení se nezdařilo/i })).toBeVisible();
  await expect(dialog).toContainText(/zkontrolujte email a heslo/i);

  await page.getByLabel(/heslo/i).fill('locked-pass');
  await page.getByRole('button', { name: /přihlásit/i }).click();
  await expect(dialog).toContainText(/účet je dočasně uzamčen/i);
});
