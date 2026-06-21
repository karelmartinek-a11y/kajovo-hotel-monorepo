import { expect, test, type Page } from '@playwright/test';
import { getAdminCredentials } from '../../kajovo-hotel-admin/test-admin-credentials';
import { getPortalCredentials } from '../test-live-credentials';

const { email: adminEmail, password: adminPassword } = getAdminCredentials();
const { email: portalEmail, password: portalPassword } = getPortalCredentials();

type RouteCheck = {
  path: string;
  readyTestId?: string;
  heading?: RegExp;
};

type ClientIssue = {
  kind: 'console' | 'requestfailed' | 'response';
  message: string;
};

const publicRoutes: RouteCheck[] = [
  { path: '/login', readyTestId: 'portal-login-page' },
  { path: '/login/reset' },
  { path: '/admin/login', readyTestId: 'admin-login-page' },
];

const adminRoutes: RouteCheck[] = [
  { path: '/admin/', readyTestId: 'dashboard-page' },
  { path: '/admin/pokojska', readyTestId: 'housekeeping-admin-page' },
  { path: '/admin/snidane', readyTestId: 'breakfast-list-page' },
  { path: '/admin/ztraty-a-nalezy', readyTestId: 'lost-found-list-page' },
  { path: '/admin/zavady', readyTestId: 'issues-list-page' },
  { path: '/admin/sklad', readyTestId: 'inventory-list-page' },
  { path: '/admin/hlaseni', readyTestId: 'reports-list-page' },
  { path: '/admin/uzivatele', readyTestId: 'users-admin-page' },
  { path: '/admin/nastaveni', readyTestId: 'settings-admin-page' },
  { path: '/admin/profil', readyTestId: 'admin-profile-page' },
];

function attachClientIssueCollector(page: Page): { issues: ClientIssue[]; reset: () => void } {
  const issues: ClientIssue[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    issues.push({ kind: 'console', message: message.text() });
  });
  page.on('requestfailed', (request) => {
    issues.push({
      kind: 'requestfailed',
      message: `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'request failed'}`,
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) {
      return;
    }
    const request = response.request();
    issues.push({
      kind: 'response',
      message: `${request.method()} ${response.url()} :: HTTP ${response.status()}`,
    });
  });
  return {
    issues,
    reset: () => {
      issues.length = 0;
    },
  };
}

function assertNoClientIssues(issues: ClientIssue[], allow: RegExp[] = []): void {
  const unexpected = issues.filter((entry) => !allow.some((pattern) => pattern.test(entry.message)));
  expect(unexpected, unexpected.map((entry) => `${entry.kind}: ${entry.message}`).join('\n')).toEqual([]);
}

async function expectReady(page: Page, route: RouteCheck): Promise<void> {
  await page.goto(route.path, { waitUntil: 'networkidle' });
  if (route.readyTestId) {
    await expect(page.getByTestId(route.readyTestId)).toBeVisible();
    return;
  }
  if (route.heading) {
    await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
    return;
  }
  await expect(page.locator('main')).toBeVisible();
}

async function loginPortal(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/email|uživatelské jméno/i).fill(portalEmail);
  await page.getByLabel(/heslo/i).fill(portalPassword);
  await page.getByRole('button', { name: /přihlásit|prihlasit/i }).click();
  await expect(page).not.toHaveURL(/\/login(?:\/reset)?$/);
  await expect(page.locator('main')).toBeVisible();
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/admin email/i).fill(adminEmail);
  await page.getByLabel(/admin heslo/i).fill(adminPassword);
  await page.getByRole('button', { name: /přihlásit|prihlasit/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
}

async function collectNavRoutes(page: Page, testId: string): Promise<string[]> {
  const locator = page.getByTestId(testId);
  if (!(await locator.isVisible())) {
    return [];
  }
  const trigger = locator.getByRole('button').first();
  if (await trigger.isVisible()) {
    await trigger.click();
  }
  return Array.from(new Set(await locator.locator('a[href]').evaluateAll((nodes) => nodes
    .map((node) => {
      const href = node.getAttribute('href') ?? '';
      return href.startsWith('/') ? href : new URL(href, window.location.origin).pathname;
    })
    .filter((href) => href.startsWith('/'))))).sort();
}

async function maybeOpenFirstDetail(page: Page): Promise<void> {
  const detailLink = page.getByRole('link', { name: /detail/i }).first();
  if (!(await detailLink.isVisible())) {
    return;
  }
  await detailLink.click();
  await expect(page.locator('main')).toBeVisible();
}

async function maybeOpenCreateForm(page: Page): Promise<void> {
  const createLink = page.getByRole('link', { name: /nový|nová|nové/i }).first();
  if (!(await createLink.isVisible())) {
    return;
  }
  await createLink.click();
  await expect(page.locator('main')).toBeVisible();
}

test.describe('live temp production verification', () => {
  test('unauthenticated public and admin routes keep canonical redirects and no client errors', async ({ page }, testInfo) => {
    const collector = attachClientIssueCollector(page);

    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('portal-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.goto('/admin', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.goto('/Admin', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.goto('/Admin/login', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    if (testInfo.project.name === 'desktop') {
      for (const route of publicRoutes) {
        collector.reset();
        await expectReady(page, route);
        assertNoClientIssues(collector.issues);
      }
    }
  });

  test('portal auth flow, protected routes and visible modules stay functional', async ({ page }, testInfo) => {
    const collector = attachClientIssueCollector(page);

    await page.goto('/snidane', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('portal-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByLabel(/email|uživatelské jméno/i).fill(portalEmail);
    await page.getByLabel(/heslo/i).fill('neplatne-heslo');
    await page.getByRole('button', { name: /přihlásit|prihlasit/i }).click();
    await expect(page.getByText(/neplatné|neplatne|přihlášení se nezdařilo|prihlaseni se nezdarilo/i)).toBeVisible();
    assertNoClientIssues(collector.issues, [/POST .*\/api\/auth\/login :: HTTP 401/]);

    collector.reset();
    await loginPortal(page);
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('main')).toBeVisible();
    assertNoClientIssues(collector.issues);

    if (testInfo.project.name !== 'desktop') {
      return;
    }

    const navRoutes = new Set<string>(['/profil']);
    for (const route of await collectNavRoutes(page, 'module-navigation-desktop')) {
      navRoutes.add(route);
    }
    for (const route of await collectNavRoutes(page, 'module-navigation-phone')) {
      navRoutes.add(route);
    }

    for (const route of Array.from(navRoutes).sort()) {
      collector.reset();
      await page.goto(route, { waitUntil: 'networkidle' });
      await expect(page.locator('main')).toBeVisible();
      await maybeOpenFirstDetail(page);
      assertNoClientIssues(collector.issues);
    }

    collector.reset();
    await page.goto('/profil', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('portal-profile-page')).toBeVisible();
    await page.getByRole('button', { name: /odhlásit|odhlasit/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('portal-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);
  });

  test('admin auth flow, route inventory and logout stay functional', async ({ page }, testInfo) => {
    const collector = attachClientIssueCollector(page);

    await page.goto('/admin/uzivatele', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.goto('/admin/login', { waitUntil: 'networkidle' });
    await page.getByLabel(/admin email/i).fill(adminEmail);
    await page.getByLabel(/admin heslo/i).fill('neplatne-heslo');
    await page.getByRole('button', { name: /přihlásit|prihlasit/i }).click();
    await expect(page.getByText(/neplatné|neplatne|přihlášení se nezdařilo|prihlaseni se nezdarilo/i)).toBeVisible();
    assertNoClientIssues(collector.issues, [/POST .*\/api\/auth\/admin\/login :: HTTP 401/]);

    collector.reset();
    await loginAdmin(page);
    assertNoClientIssues(collector.issues);

    collector.reset();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    assertNoClientIssues(collector.issues);

    if (testInfo.project.name !== 'desktop') {
      return;
    }

    for (const route of adminRoutes) {
      collector.reset();
      await expectReady(page, route);
      await maybeOpenFirstDetail(page);
      if (/\/admin\/(snidane|ztraty-a-nalezy|zavady|sklad|hlaseni)$/.test(route.path)) {
        await page.goto(route.path, { waitUntil: 'networkidle' });
        await maybeOpenCreateForm(page);
      }
      assertNoClientIssues(collector.issues);
    }

    collector.reset();
    await page.goto('/admin/profil', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('admin-profile-page')).toBeVisible();
    await page.getByRole('button', { name: /odhlásit|odhlasit/i }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
    assertNoClientIssues(collector.issues);
  });

  test('live API endpoints used by browser surfaces stay healthy', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();

    const release = await request.get('/api/app/android-release');
    expect(release.ok()).toBeTruthy();

    const portalMe = await request.get('/api/auth/me');
    expect([200, 401]).toContain(portalMe.status());
  });
});
