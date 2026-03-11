import { expect, test, type Page, type Route } from '@playwright/test';

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

test('housekeeping can submit room issue with photo from housekeeping form', async ({ page }) => {
  let createdPayload: { title?: string; description?: string; location?: string; room_number?: string } | null = null;
  let photoUploadCalled = false;

  await mockAuth(page, {
    email: 'pokojska@example.com',
    role: 'pokojska',
    permissions: ['housekeeping:read', 'issues:read', 'issues:write', 'lost_found:read', 'lost_found:write'],
    actor_type: 'portal',
  });

  await page.route('**/api/v1/issues', async (route) => {
    if (route.request().method() === 'POST') {
      createdPayload = JSON.parse(route.request().postData() ?? '{}') as { title?: string; description?: string; location?: string; room_number?: string };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          title: createdPayload?.title ?? 'Rozbite svetlo',
          description: createdPayload?.description ?? 'Rozbite svetlo',
          location: createdPayload?.location ?? 'Pokoj 101',
          room_number: createdPayload?.room_number ?? '101',
          priority: 'medium',
          status: 'new',
          assignee: null,
          in_progress_at: null,
          resolved_at: null,
          closed_at: null,
          created_at: '2026-03-11T08:00:00Z',
          updated_at: '2026-03-11T08:00:00Z',
          photos: [],
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/api/v1/issues/1/photos', async (route) => {
    photoUploadCalled = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/pokojska');
  await page.getByLabel('Krátký popis').fill('Rozbité světlo');
  await page.getByLabel('Fotografie (volitelné)').setInputFiles({
    name: 'issue.jpg',
    mimeType: 'image/jpeg',
    buffer: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  });
  await page.getByRole('button', { name: 'Odeslat' }).click();

  await expect(page.getByText('Záznam byl uložen.')).toBeVisible();
  const created = createdPayload as { room_number?: string; location?: string } | null;
  if (!created) {
    throw new Error('Expected created payload');
  }
  expect(created.room_number).toBeTruthy();
  expect(created.location).toMatch(/^Pokoj /);
  expect(photoUploadCalled).toBeTruthy();
});

test('maintenance can mark issue as done from issues list', async ({ page }) => {
  let updatedStatus: string | null = null;

  await mockAuth(page, {
    email: 'udrzba@example.com',
    role: 'udrzba',
    permissions: ['issues:read', 'issues:write'],
    actor_type: 'portal',
  });

  await page.route('**/api/v1/issues**', async (route) => {
    if (route.request().method() === 'PUT') {
      updatedStatus = JSON.parse(route.request().postData() ?? '{}').status ?? null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          title: 'Rozbite svetlo',
          description: 'Pokoj 204',
          location: 'Pokoj 204',
          room_number: '204',
          priority: 'medium',
          status: 'resolved',
          assignee: null,
          in_progress_at: '2026-03-11T08:05:00Z',
          resolved_at: '2026-03-11T08:10:00Z',
          closed_at: null,
          created_at: '2026-03-11T08:00:00Z',
          updated_at: '2026-03-11T08:10:00Z',
          photos: [],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          title: 'Rozbite svetlo',
          description: 'Pokoj 204',
          location: 'Pokoj 204',
          room_number: '204',
          priority: 'medium',
          status: 'new',
          assignee: null,
          in_progress_at: null,
          resolved_at: null,
          closed_at: null,
          created_at: '2026-03-11T08:00:00Z',
          updated_at: '2026-03-11T08:00:00Z',
          photos: [],
        },
      ]),
    });
  });

  await page.goto('/zavady');
  await expect(page.getByTestId('issues-list-page')).toBeVisible();
  await page.getByRole('button', { name: 'Hotovo' }).click();

  expect(updatedStatus).toBe('resolved');
});
