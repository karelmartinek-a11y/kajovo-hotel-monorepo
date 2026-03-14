import { expect, test } from '@playwright/test';

const adminPath = (path: string): string => {
  if (path.startsWith('/admin')) {
    return path;
  }
  return `/admin${path.startsWith('/') ? '' : '/'}${path}`;
};

const breakfastSummary = {
  service_date: '2026-03-11',
  total_orders: 6,
  total_guests: 11,
  status_counts: {
    pending: 2,
    preparing: 1,
    served: 3,
    cancelled: 0,
  },
};

const issues = [
  {
    id: 1,
    title: 'Výpadek boileru',
    description: null,
    location: 'Wellness',
    room_number: null,
    priority: 'critical',
    status: 'new',
    assignee: null,
    in_progress_at: null,
    resolved_at: null,
    closed_at: null,
    created_at: '2026-03-11T08:00:00Z',
    updated_at: '2026-03-11T08:00:00Z',
  },
  {
    id: 2,
    title: 'Nefunkční světlo',
    description: null,
    location: 'Pokoj 204',
    room_number: '204',
    priority: 'high',
    status: 'in_progress',
    assignee: 'Petr',
    in_progress_at: '2026-03-11T09:00:00Z',
    resolved_at: null,
    closed_at: null,
    created_at: '2026-03-11T08:30:00Z',
    updated_at: '2026-03-11T09:00:00Z',
  },
];

const inventoryItems = [
  {
    id: 1,
    name: 'Mléko',
    unit: 'l',
    min_stock: 10,
    current_stock: 3,
    supplier: null,
    created_at: '2026-03-11T08:00:00Z',
    updated_at: '2026-03-11T08:00:00Z',
  },
];

const reports = [
  {
    id: 1,
    title: 'Rozbitá židle',
    description: null,
    status: 'open',
    created_at: '2026-03-11T08:00:00Z',
    updated_at: '2026-03-11T08:00:00Z',
  },
  {
    id: 2,
    title: 'Netěsnost sprchy',
    description: null,
    status: 'in_progress',
    created_at: '2026-03-11T08:30:00Z',
    updated_at: '2026-03-11T09:00:00Z',
  },
];

const lostFound = [
  {
    id: 1,
    item_type: 'found',
    description: 'Černá peněženka',
    category: 'Osobní věci',
    location: 'Recepce',
    room_number: null,
    event_at: '2026-03-11T07:00:00Z',
    status: 'stored',
    claimant_name: null,
    claimant_contact: null,
    handover_note: null,
    claimed_at: null,
    returned_at: null,
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      json: {
        email: 'admin@kajovohotel.local',
        role: 'admin',
        roles: ['admin'],
        active_role: 'admin',
        permissions: [
          'dashboard:read',
          'housekeeping:read',
          'breakfast:read',
          'breakfast:write',
          'lost_found:read',
          'lost_found:write',
          'issues:read',
          'issues:write',
          'inventory:read',
          'inventory:write',
          'reports:read',
          'reports:write',
          'users:read',
          'users:write',
          'settings:read',
          'settings:write',
        ],
        actor_type: 'admin',
      },
    });
  });

  await page.route('**/api/v1/breakfast/daily-summary?*', async (route) => {
    await route.fulfill({ json: breakfastSummary });
  });
  await page.route('**/api/v1/issues?*', async (route) => {
    await route.fulfill({ json: issues });
  });
  await page.route('**/api/v1/issues', async (route) => {
    await route.fulfill({ json: issues });
  });
  await page.route('**/api/v1/inventory?low_stock=true', async (route) => {
    await route.fulfill({ json: inventoryItems });
  });
  await page.route('**/api/v1/inventory', async (route) => {
    await route.fulfill({ json: inventoryItems });
  });
  await page.route('**/api/v1/reports?*', async (route) => {
    await route.fulfill({ json: reports });
  });
  await page.route('**/api/v1/reports', async (route) => {
    await route.fulfill({ json: reports });
  });
  await page.route('**/api/v1/lost-found?*', async (route) => {
    await route.fulfill({ json: lostFound });
  });
  await page.route('**/api/v1/lost-found', async (route) => {
    await route.fulfill({ json: lostFound });
  });
  await page.route('**/api/v1/admin/settings/smtp/status', async (route) => {
    await route.fulfill({
      json: {
        configured: true,
        smtp_enabled: false,
        delivery_mode: 'disabled',
        can_send_real_email: false,
        last_test_connected: null,
        last_test_send_attempted: null,
        last_tested_at: null,
        last_test_success: null,
        last_test_recipient: null,
        last_test_error: null,
      },
    });
  });
  await page.route('**/api/v1/admin/settings/smtp', async (route) => {
    await route.fulfill({
      json: {
        host: 'smtp.local',
        port: 1025,
        username: 'mailer@kajovohotel.local',
        use_tls: false,
        use_ssl: false,
        password_masked: 'm****r',
      },
    });
  });
});

test('dashboard uses live KPI data instead of fixed cards', async ({ page }) => {
  await page.goto(adminPath('/'));
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
  await expect(page.getByText('6')).toBeVisible();
  await expect(page.getByText('2 čekajících objednávek')).toBeVisible();
  await expect(page.getByText('2 kritických otevřených závad')).not.toBeVisible();
  await expect(page.getByText('1 kritických otevřených závad')).toBeVisible();
  await expect(page.locator('section').filter({ hasText: 'Sklad1položek pod minimem' }).getByRole('strong')).toContainText('1');
  await expect(page.getByText('položek pod minimem')).toBeVisible();
});

test('housekeeping admin page is a live handoff, not a dead-end stub', async ({ page }) => {
  await page.goto(adminPath('/pokojska'));
  await expect(page.getByTestId('housekeeping-admin-page')).toBeVisible();
  await expect(page.getByText('Operativní handoff')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Otevřít závady' })).toBeVisible();
  await expect(page.getByText('Tento modul je určen pro portálové role. Pro zadání použijte portál.')).toHaveCount(0);
});

test('inventory empty state stays operational without bootstrap helpers', async ({ page }) => {
  await page.route('**/api/v1/inventory', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/v1/inventory/cards', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/v1/inventory/movements', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.goto(adminPath('/sklad'));
  await expect(page.getByTestId('inventory-list-page')).toBeVisible();
  await expect(page.getByText('Ve skladu zatím nejsou položky.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Doplnit výchozí položky' })).toHaveCount(0);
});

test('lost-found empty state uses correct Czech copy', async ({ page }) => {
  await page.route('**/api/v1/lost-found?*', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/v1/lost-found', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.goto(adminPath('/ztraty-a-nalezy'));
  await expect(page.getByRole('heading', { name: 'Ztr\u00e1ty a n\u00e1lezy' })).toBeVisible();
  await expect(page.getByText('Pr\u00e1zdn\u00fd stav')).toBeVisible();
  await expect(page.getByText('\u017d\u00e1dn\u00fd evidovan\u00fd n\u00e1lez.')).toBeVisible();
  await expect(page.getByText('Pr?zdn? stav')).toHaveCount(0);
});

test('settings page exposes SMTP operational status', async ({ page }) => {
  await page.goto(adminPath('/nastaveni'));
  await expect(page.getByTestId('settings-admin-page')).toBeVisible();
  await expect(page.getByText('Provozn\u00ed stav')).toBeVisible();
  await expect(page.getByText('SMTP není aktivní')).toBeVisible();
  await expect(page.getByText('Je\u0161t\u011b neb\u011bhl')).toBeVisible();
});

test('settings page treats missing SMTP config as empty form, not as load error', async ({ page }) => {
  await page.route('**/api/v1/admin/settings/smtp', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'SMTP settings not configured' }),
    });
  });
  await page.route('**/api/v1/admin/settings/smtp/status', async (route) => {
    await route.fulfill({
      json: {
        configured: false,
        smtp_enabled: false,
        delivery_mode: 'unconfigured',
        can_send_real_email: false,
        last_tested_at: null,
        last_test_success: null,
        last_test_recipient: null,
        last_test_error: null,
      },
    });
  });

  await page.goto(adminPath('/nastaveni'));
  await expect(page.getByTestId('settings-admin-page')).toBeVisible();
  await expect(page.getByText('Nepodařilo se načíst SMTP nastavení.')).toHaveCount(0);
  await expect(page.locator('#smtp_host')).toHaveValue('');
  await expect(page.getByText('Nenakonfigurov\u00e1no')).toBeVisible();
});

test('settings page treats generic 404 SMTP config as empty form when status says unconfigured', async ({ page }) => {
  await page.route('**/api/v1/admin/settings/smtp', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not Found' }),
    });
  });
  await page.route('**/api/v1/admin/settings/smtp/status', async (route) => {
    await route.fulfill({
      json: {
        configured: false,
        smtp_enabled: false,
        delivery_mode: 'unconfigured',
        can_send_real_email: false,
        last_tested_at: null,
        last_test_success: null,
        last_test_recipient: null,
        last_test_error: null,
      },
    });
  });

  await page.goto(adminPath('/nastaveni'));
  await expect(page.getByTestId('settings-admin-page')).toBeVisible();
  await expect(page.getByText('Nepodařilo se načíst SMTP nastavení.')).toHaveCount(0);
  await expect(page.locator('#smtp_host')).toHaveValue('');
  await expect(page.getByText('Nenakonfigurov\u00e1no')).toBeVisible();
});


test('inventory detail shows proper Czech copy and item data', async ({ page }) => {
  await page.route('**/api/v1/inventory/1', async (route) => {
    await route.fulfill({
      json: {
        id: 1,
        name: 'Mléko',
        unit: 'l',
        min_stock: 10,
        current_stock: 3,
        amount_per_piece_base: 1,
        pictogram_path: null,
        pictogram_thumb_path: null,
        created_at: '2026-03-11T08:00:00Z',
        updated_at: '2026-03-11T08:00:00Z',
        audit_logs: [],
        movements: [
          {
            id: 11,
            item_id: 1,
            movement_type: 'in',
            quantity: 5,
            quantity_pieces: 5,
            document_number: 'PR-20260311-001',
            document_reference: 'FA-2026-001',
            document_date: '2026-03-11T08:00:00Z',
            note: 'Naskladnění',
            created_at: '2026-03-11T08:00:00Z',
            card_id: null,
            card_item_id: null,
            card_number: null,
          },
        ],
      },
    });
  });

  await page.goto(adminPath('/sklad/1'));
  await expect(page.getByTestId('inventory-detail-page')).toContainText('Detail skladové položky');
  await expect(page.getByText('Aktuální množství a historie pohybů zůstávají dostupné jen adminovi.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zpět na seznam' })).toBeVisible();
  await expect(page.getByText('Interní číslo')).toBeVisible();
  await expect(page.getByText('Číslo dokladu')).toBeVisible();
});

test('inventory detail does not mask access denial as 404', async ({ page }) => {
  await page.route('**/api/v1/inventory/1', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Missing role: admin' }),
    });
  });

  await page.goto(adminPath('/sklad/1'));
  await expect(page.getByTestId('inventory-detail-page')).toBeVisible();
  await expect(page.getByText('Přístup odepřen')).toBeVisible();
  await expect(page.getByText('404')).toHaveCount(0);
});
