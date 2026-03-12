import { expect, test } from '@playwright/test';

const adminPath = (path: string): string => {
  if (path.startsWith('/admin')) {
    return path;
  }
  return path === '/' ? '/admin/' : `/admin${path}`;
};

const keyRoutes = ['/', '/snidane', '/ztraty-a-nalezy', '/intro', '/offline', '/maintenance', '/404', '/login'].map(adminPath);
const runtimeServiceDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', async (route) =>
    route.fulfill({
      json: {
        email: 'admin@example.com',
        role: 'admin',
        permissions: [
          'dashboard:read',
          'breakfast:read',
          'lost_found:read',
          'issues:read',
          'inventory:read',
          'reports:read',
          'users:read',
          'settings:read',
        ],
        actor_type: 'admin',
      },
    })
  );
  await page.route('**/api/v1/breakfast?*', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/breakfast/daily-summary?*', async (route) =>
    route.fulfill({ json: { service_date: runtimeServiceDate, total_orders: 0, total_guests: 0, status_counts: { pending: 0, preparing: 0, served: 0, cancelled: 0 } } })
  );
  await page.route('**/api/v1/lost-found?*', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/admin/profile', async (route) =>
    route.fulfill({ json: { email: 'admin@example.com', display_name: 'Admin', password_changed_at: null, updated_at: null } })
  );
  await page.route('**/api/v1/admin/settings/smtp', async (route) =>
    route.fulfill({ json: { host: 'smtp.example.com', port: 587, username: 'mailer', use_tls: true, use_ssl: false, password_masked: '••••••••' } })
  );
});

test('signace is present on key routes', async ({ page }) => {
  for (const route of keyRoutes) {
    await page.goto(route);
    const signace = page.getByTestId('kajovo-sign');
    await expect(signace, `Missing signace on ${route}`).toBeVisible();
    await expect(signace.locator('img')).toHaveAttribute('src', /signace\.svg/);
  }
});

test('brand composition stays at max two elements on key routes', async ({ page }) => {
  for (const route of keyRoutes) {
    await page.goto(route);
    const count = await page.locator('[data-brand-element="true"]').count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(2);
  }
});
