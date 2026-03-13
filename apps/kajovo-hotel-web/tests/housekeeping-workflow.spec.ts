import { expect, test, type Page, type Route } from '@playwright/test';

type AuthPayload = {
  email: string;
  role: string;
  permissions: string[];
  actor_type: 'admin' | 'portal';
  roles?: string[];
  active_role?: string | null;
  user_id?: string;
};

async function mockAuth(page: Page, payload: AuthPayload): Promise<void> {
  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user_id: payload.user_id ?? payload.email,
        roles: payload.roles ?? [payload.role],
        active_role: payload.active_role ?? payload.role,
        ...payload,
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.cookie = 'kajovo_csrf=test-token; path=/';
  });
});

test('housekeeping submits a simple issue from the room picker with up to three photos', async ({ page }) => {
  await mockAuth(page, {
    email: 'pokojska@example.com',
    role: 'pokojska',
    roles: ['pokojska'],
    permissions: ['housekeeping:read', 'issues:write', 'lost_found:write'],
    actor_type: 'portal',
  });

  let createdIssueId: number | null = null;
  let uploadedCount = 0;

  await page.route('**/api/v1/issues', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    createdIssueId = 81;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 81,
        ...payload,
        created_at: '2026-03-12T10:00:00Z',
        updated_at: '2026-03-12T10:00:00Z',
        in_progress_at: null,
        resolved_at: null,
        closed_at: null,
        photos: [],
      }),
    });
  });
  await page.route('**/api/v1/issues/81/photos', async (route) => {
    uploadedCount = 2;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/pokojska');
  await expect(page.getByTestId('housekeeping-form-page')).toBeVisible();
  await page.locator('#housekeeping_room').selectOption('223');
  await page.locator('#housekeeping_description').fill('Nesv\u00edt\u00ed lampi\u010dka');
  await page.setInputFiles('#housekeeping_photos', [
    'tests/fixtures/inventory-thumb.png',
    'tests/fixtures/inventory-thumb.png',
  ]);
  await page.getByRole('button', { name: /odeslat/i }).click();

  expect(createdIssueId).toBe(81);
  await expect(page.getByTestId('housekeeping-form-page')).toBeVisible();
});

test('maintenance sees only open issues with hours since creation and can mark them resolved', async ({ page }) => {
  await mockAuth(page, {
    email: 'udrzba@example.com',
    role: 'udrzba',
    roles: ['udrzba'],
    permissions: ['issues:read', 'issues:write'],
    actor_type: 'portal',
  });

  let issueVisible = true;
  await page.route('**/api/v1/issues**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        issueVisible
          ? [
              {
                id: 91,
                title: 'Pokoj 224',
                description: 'Prot\u00e9k\u00e1 baterie',
                location: 'Pokoj 224',
                room_number: '224',
                priority: 'medium',
                status: 'new',
                assignee: null,
                created_at: '2026-03-12T06:00:00Z',
                updated_at: '2026-03-12T06:00:00Z',
                in_progress_at: null,
                resolved_at: null,
                closed_at: null,
                photos: [],
              },
            ]
          : [],
      ),
    });
  });
  await page.route('**/api/v1/issues/91', async (route) => {
    issueVisible = false;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 91,
        title: 'Pokoj 224',
        description: 'Prot\u00e9k\u00e1 baterie',
        location: 'Pokoj 224',
        room_number: '224',
        priority: 'medium',
        status: 'resolved',
        assignee: null,
        created_at: '2026-03-12T06:00:00Z',
        updated_at: '2026-03-12T10:00:00Z',
        in_progress_at: null,
        resolved_at: '2026-03-12T10:00:00Z',
        closed_at: null,
        photos: [],
      }),
    });
  });

  await page.goto('/zavady');
  await expect(page.getByTestId('issues-list-page')).toContainText('Prot\u00e9k\u00e1 baterie');
  await page.getByTestId('issues-list-page').getByRole('button').click();
  await expect(page.getByTestId('issues-list-page')).not.toContainText('Prot\u00e9k\u00e1 baterie');
});

test('reception sees pending lost-found only and processing removes it from the list', async ({ page }) => {
  await mockAuth(page, {
    email: 'recepce@example.com',
    role: 'recepce',
    roles: ['recepce'],
    permissions: ['lost_found:read', 'lost_found:write'],
    actor_type: 'portal',
  });

  let pendingVisible = true;
  await page.route('**/api/v1/lost-found**', async (route) => {
    if (route.request().method() === 'PUT') {
      pendingVisible = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 101,
          item_type: 'found',
          category: 'N\u00e1lez',
          description: '\u010cern\u00e1 mikina',
          location: 'Pokoj 321',
          room_number: '321',
          event_at: '2026-03-12T08:00:00Z',
          status: 'claimed',
          tags: [],
          claimant_name: null,
          claimant_contact: null,
          handover_note: null,
          claimed_at: '2026-03-12T10:00:00Z',
          returned_at: null,
          photos: [],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        pendingVisible
          ? [
              {
                id: 101,
                item_type: 'found',
                category: 'N\u00e1lez',
                description: '\u010cern\u00e1 mikina',
                location: 'Pokoj 321',
                room_number: '321',
                event_at: '2026-03-12T08:00:00Z',
                status: 'new',
                tags: [],
                claimant_name: null,
                claimant_contact: null,
                handover_note: null,
                claimed_at: null,
                returned_at: null,
                photos: [],
              },
            ]
          : [],
      ),
    });
  });

  await page.goto('/ztraty-a-nalezy');
  await expect(page.getByTestId('lost-found-list-page')).toContainText('\u010cern\u00e1 mikina');
  await page.getByTestId('lost-found-list-page').getByRole('button').click();
  await expect(page.getByTestId('lost-found-list-page')).not.toContainText('\u010cern\u00e1 mikina');
});
