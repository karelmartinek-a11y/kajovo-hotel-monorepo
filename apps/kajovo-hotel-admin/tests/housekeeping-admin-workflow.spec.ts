import { expect, test, type Page, type Route } from '@playwright/test';

const adminPath = (path: string): string => {
  if (path.startsWith('/admin')) {
    return path;
  }
  return `/admin${path.startsWith('/') ? '' : '/'}${path}`;
};

async function mockAuth(page: Page): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'admin@example.com',
        role: 'admin',
        permissions: ['housekeeping:read', 'issues:read', 'issues:write', 'lost_found:read', 'lost_found:write'],
        actor_type: 'admin',
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });
});

test('admin can reopen and delete issue and lost-found records', async ({ page }) => {
  await mockAuth(page);

  let issueStatus = 'resolved';
  let lostFoundStatus = 'claimed';

  await page.route('**/api/v1/issues/301/photos', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/v1/issues/301', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 301,
          title: 'Pokoj 109',
          description: 'Nefunguje televize',
          location: 'Pokoj 109',
          room_number: '109',
          priority: 'medium',
          status: issueStatus,
          assignee: null,
          created_at: '2026-03-12T08:00:00Z',
          updated_at: '2026-03-12T08:00:00Z',
          in_progress_at: null,
          resolved_at: '2026-03-12T10:00:00Z',
          closed_at: null,
          photos: [],
        }),
      });
      return;
    }
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as { status: string };
      issueStatus = payload.status;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 301,
          title: 'Pokoj 109',
          description: 'Nefunguje televize',
          location: 'Pokoj 109',
          room_number: '109',
          priority: 'medium',
          status: issueStatus,
          assignee: null,
          created_at: '2026-03-12T08:00:00Z',
          updated_at: '2026-03-12T10:00:00Z',
          in_progress_at: null,
          resolved_at: null,
          closed_at: null,
          photos: [],
        }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/api/v1/lost-found/401/photos', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/v1/lost-found/401', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 401,
          item_type: 'found',
          category: 'Nález',
          description: 'Modrá bunda',
          location: 'Pokoj 324',
          room_number: '324',
          event_at: '2026-03-12T07:00:00Z',
          status: lostFoundStatus,
          tags: [],
          claimant_name: null,
          claimant_contact: null,
          handover_note: null,
          claimed_at: '2026-03-12T09:00:00Z',
          returned_at: null,
          photos: [],
        }),
      });
      return;
    }
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as { status: string };
      lostFoundStatus = payload.status;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 401,
          item_type: 'found',
          category: 'Nález',
          description: 'Modrá bunda',
          location: 'Pokoj 324',
          room_number: '324',
          event_at: '2026-03-12T07:00:00Z',
          status: lostFoundStatus,
          tags: [],
          claimant_name: null,
          claimant_contact: null,
          handover_note: null,
          claimed_at: null,
          returned_at: null,
          photos: [],
        }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto(adminPath('/zavady/301'));
  await expect(page.getByTestId('issues-detail-page')).toContainText('Nefunguje televize');
  await page.getByRole('button', { name: /znovu otevřít/i }).click();
  await expect(page.getByText(/nová/i)).toBeVisible();
  await page.getByRole('button', { name: /^smazat$/i }).click();
  await expect(page).toHaveURL(/\/admin\/zavady$/);

  await page.goto(adminPath('/ztraty-a-nalezy/401'));
  await expect(page.getByTestId('lost-found-detail-page')).toContainText('Modrá bunda');
  await page.getByRole('button', { name: /vrátit do nezpracovaných/i }).click();
  await expect(page.getByText(/nový/i)).toBeVisible();
  await page.getByRole('button', { name: /^smazat$/i }).click();
  await expect(page).toHaveURL(/\/admin\/ztraty-a-nalezy$/);
});
