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

test('admin can reopen resolved issue and delete it from detail', async ({ page }) => {
  let currentIssue: {
    id: number;
    title: string;
    description: string;
    location: string;
    room_number: string;
    priority: string;
    status: string;
    assignee: string | null;
    in_progress_at: string | null;
    resolved_at: string | null;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
    photos: unknown[];
  } = {
    id: 1,
    title: 'Rozbite zrcadlo',
    description: 'Pokoj 205',
    location: 'Pokoj 205',
    room_number: '205',
    priority: 'medium',
    status: 'resolved',
    assignee: '' as string | null,
    in_progress_at: '2026-03-11T08:05:00Z',
    resolved_at: '2026-03-11T08:10:00Z',
    closed_at: null,
    created_at: '2026-03-11T08:00:00Z',
    updated_at: '2026-03-11T08:10:00Z',
    photos: [],
  };
  let reopenPayload: { status?: string } | null = null;
  let deleteCalled = false;

  await mockAuth(page, {
    email: 'admin@kajovohotel.local',
    role: 'admin',
    permissions: ['issues:read', 'issues:write', 'dashboard:read', 'housekeeping:read'],
    actor_type: 'admin',
  });

  await page.route('**/api/v1/issues/1/photos', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/api/v1/issues/1', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      reopenPayload = JSON.parse(route.request().postData() ?? '{}') as { status?: string };
      currentIssue = {
        ...currentIssue,
        status: 'new',
        resolved_at: null,
        closed_at: null,
        updated_at: '2026-03-11T08:12:00Z',
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentIssue) });
      return;
    }
    if (method === 'DELETE') {
      deleteCalled = true;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentIssue) });
  });

  await page.route('**/api/v1/issues', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto(adminPath('/zavady/1'));
  await expect(page.getByTestId('issues-detail-page')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Znovu otevřít' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Smazat' })).toBeVisible();

  await page.getByRole('button', { name: 'Znovu otevřít' }).click();
  const reopened = reopenPayload as { status?: string } | null;
  expect(reopened ? reopened.status : null).toBe('new');
  await expect(page.getByRole('button', { name: 'Znovu otevřít' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Smazat' }).click();
  await expect(page).toHaveURL(/\/admin\/zavady$/);
  expect(deleteCalled).toBeTruthy();
});
