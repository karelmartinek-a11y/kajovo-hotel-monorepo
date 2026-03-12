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

type BreakfastItem = {
  id: number;
  service_date: string;
  room_number: string;
  guest_name: string | null;
  guest_count: number;
  status: 'pending' | 'served';
  note: string | null;
  diet_no_gluten?: boolean;
  diet_no_milk?: boolean;
  diet_no_pork?: boolean;
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

test('portal login supports invalid credentials, forgot password and role selection', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) => {
    const payload = route.request().postDataJSON() as { password?: string };
    if (payload.password === 'spravne-heslo') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          email: 'recepce@example.com',
          actor_type: 'portal',
          roles: ['recepce', 'snídaně'],
          active_role: null,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Invalid credentials' }),
    });
  });
  await page.route('**/api/auth/forgot-password', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/auth/select-role', async (route) => {
    expect(route.request().headers()['x-csrf-token']).toBe('test-token');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('recepce@example.com');
  await page.getByLabel(/heslo/i).fill('spatne-heslo');
  await page.getByRole('button', { name: /přihlásit/i }).click();
  await expect(page.getByRole('alert')).toContainText(/neplatné přihlašovací údaje/i);

  await page.getByRole('button', { name: /zapomenuté heslo/i }).click();
  await expect(page.getByText(/odeslán odkaz pro obnovu/i)).toBeVisible();

  await page.getByLabel(/heslo/i).fill('spravne-heslo');
  await page.getByRole('button', { name: /přihlásit/i }).click();
  await expect(page.getByTestId('portal-login-page')).toContainText(/pokračovat jako recepce/i);
  await page.getByRole('button', { name: /pokračovat jako snídaně/i }).click();
});

test('portal breakfast workflow covers import preview, export, diets, serving and reactivation', async ({ page }) => {
  await mockAuth(page, {
    email: 'recepce@example.com',
    role: 'recepce',
    roles: ['recepce'],
    permissions: ['breakfast:read', 'breakfast:write'],
    actor_type: 'portal',
  });

  let items: BreakfastItem[] = [
    {
      id: 11,
      service_date: '2026-03-12',
      room_number: '201',
      guest_name: 'Eva Králová',
      guest_count: 2,
      status: 'served',
      note: null,
      diet_no_gluten: false,
      diet_no_milk: false,
      diet_no_pork: false,
    },
    {
      id: 12,
      service_date: '2026-03-12',
      room_number: '305',
      guest_name: 'Jan Novotný',
      guest_count: 1,
      status: 'pending',
      note: null,
      diet_no_gluten: false,
      diet_no_milk: false,
      diet_no_pork: false,
    },
  ];

  let previewPayloadSeen = false;
  let savePayloadSeen = false;

  await page.addInitScript(() => {
    const opened: string[] = [];
    (window as Window & { __openCalls?: string[] }).__openCalls = opened;
    window.open = (url?: string | URL | undefined) => {
      if (url) {
        opened.push(String(url));
      }
      return null;
    };
  });

  await page.route('**/api/v1/breakfast/daily-summary**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_orders: items.length,
        total_guests: items.reduce((sum, item) => sum + item.guest_count, 0),
        pending_count: items.filter((item) => item.status === 'pending').length,
        served_count: items.filter((item) => item.status === 'served').length,
      }),
    });
  });
  await page.route('**/api/v1/breakfast?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items) });
  });
  await page.route('**/api/v1/breakfast/import', async (route) => {
    const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
    if (body.includes('save')) {
      savePayloadSeen = true;
      items = [
        ...items,
        {
          id: 13,
          service_date: '2026-03-12',
          room_number: '410',
          guest_name: 'Import Host',
          guest_count: 3,
          status: 'pending',
          note: null,
          diet_no_gluten: true,
          diet_no_milk: false,
          diet_no_pork: false,
        },
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          date: '2026-03-12',
          status: 'FOUND',
          saved: true,
          items: [
            { room: 410, count: 3, guest_name: 'Import Host', diet_no_gluten: true, diet_no_milk: false, diet_no_pork: false },
          ],
        }),
      });
      return;
    }
    previewPayloadSeen = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        date: '2026-03-12',
        status: 'FOUND',
        saved: false,
        items: [
          { room: 410, count: 3, guest_name: 'Import Host', diet_no_gluten: false, diet_no_milk: false, diet_no_pork: false },
        ],
      }),
    });
  });
  await page.route('**/api/v1/breakfast/*', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    const id = Number(route.request().url().split('/').pop());
    const payload = route.request().postDataJSON() as Partial<BreakfastItem>;
    items = items.map((item) => (item.id === id ? { ...item, ...payload } : item));
    const updated = items.find((item) => item.id === id);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
  });

  await page.goto('/snidane');
  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
  await expect(page.getByText('Eva Králová')).toBeVisible();
  await expect(page.getByText('Jan Novotný')).toBeVisible();

  await page.setInputFiles('input[aria-label="Import PDF"]', 'tests/fixtures/breakfast-import.pdf');
  await expect(page.getByText(/kontrola importu/i)).toBeVisible();
  await page.getByRole('button', { name: /bez lepku/i }).last().click();
  await page.getByRole('button', { name: /potvrdit import/i }).click();
  await expect(page.getByText(/import uložen/i)).toBeVisible();
  expect(previewPayloadSeen).toBeTruthy();
  expect(savePayloadSeen).toBeTruthy();

  await page.getByRole('button', { name: /bez mléka/i }).nth(1).click();
  await page.getByRole('button', { name: /reaktivovat/i }).first().click();

  await page.getByRole('button', { name: /export snídaní/i }).click();
  const exportUrl = await page.evaluate(() => (window as Window & { __openCalls?: string[] }).__openCalls?.[0] ?? null);
  expect(exportUrl).toContain('/api/v1/breakfast/export/daily?service_date=');
});

test('portal records workflows cover lost-found, issues, inventory and reports', async ({ page }) => {
  await mockAuth(page, {
    email: 'admin@example.com',
    role: 'admin',
    roles: ['recepce', 'údržba', 'sklad'],
    permissions: ['lost_found:read', 'lost_found:write', 'issues:read', 'issues:write', 'inventory:read', 'inventory:write', 'reports:read', 'reports:write'],
    actor_type: 'portal',
  });

  let lostFoundItems = [
    {
      id: 21,
      item_type: 'found',
      description: 'Modrá šála',
      category: 'Textil',
      location: 'Lobby',
      room_number: '112',
      event_at: '2026-03-12T08:00:00Z',
      status: 'new',
      tags: ['valuable'],
      claimant_name: null,
      claimant_contact: null,
      handover_note: null,
      claimed_at: null,
      returned_at: null,
      photos: [{ id: 1 }],
    },
  ];
  let issues = [
    {
      id: 31,
      title: 'Netopí radiátor',
      description: 'Pokoj 201',
      location: '2. patro',
      room_number: '201',
      priority: 'high',
      status: 'new',
      assignee: 'Údržba',
      created_at: '2026-03-12T09:00:00Z',
      in_progress_at: null,
      resolved_at: null,
      closed_at: null,
      photos: [],
    },
  ];
  let inventoryItem = {
    id: 41,
    name: 'Pomerančový džus',
    unit: 'ks',
    min_stock: 5,
    current_stock: 8,
    amount_per_piece_base: 1,
    pictogram_path: null as string | null,
    pictogram_thumb_path: null as string | null,
    movements: [] as Array<Record<string, unknown>>,
  };
  let inventoryPictogramUploaded = false;
  let reports = [
    {
      id: 51,
      title: 'Noční report',
      description: 'Bez incidentů',
      status: 'open',
      created_at: '2026-03-12T06:00:00Z',
      updated_at: '2026-03-12T06:00:00Z',
    },
  ];

  await page.route('**/api/v1/lost-found', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lostFoundItems) });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const created = { id: 22, photos: [], ...payload };
      lostFoundItems = [...lostFoundItems, created as never];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/v1/lost-found?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lostFoundItems) });
  });
  await page.route('**/api/v1/lost-found/*', async (route) => {
    const id = Number(route.request().url().split('/').slice(-1)[0]);
    if (route.request().method() === 'GET') {
      const item = lostFoundItems.find((entry) => entry.id === id);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const updated = { ...(lostFoundItems.find((entry) => entry.id === id) ?? {}), ...payload, id, photos: [] };
      lostFoundItems = lostFoundItems.map((entry) => (entry.id === id ? updated as never : entry));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/v1/issues', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(issues) });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const created = { id: 32, created_at: '2026-03-12T11:00:00Z', in_progress_at: null, resolved_at: null, closed_at: null, photos: [], ...payload };
      issues = [...issues, created as never];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/v1/issues?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(issues) });
  });
  await page.route('**/api/v1/issues/*', async (route) => {
    const id = Number(route.request().url().split('/').slice(-1)[0]);
    if (route.request().method() === 'GET') {
      const item = issues.find((entry) => entry.id === id);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const updated = { ...(issues.find((entry) => entry.id === id) ?? {}), ...payload, id };
      issues = issues.map((entry) => (entry.id === id ? updated as never : entry));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/v1/inventory/stocktake/pdf', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/pdf', body: 'pdf' });
  });
  await page.route('**/api/v1/inventory**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/stocktake/pdf') || url.pathname.match(/\/inventory\/\d+(\/movements)?$/)) {
      await route.fallback();
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([inventoryItem]) });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      inventoryItem = { ...inventoryItem, id: 42, movements: [], ...payload };
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/v1/inventory/*/movements', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    inventoryItem = {
      ...inventoryItem,
      current_stock: Number(inventoryItem.current_stock) + (payload.movement_type === 'in' ? Number(payload.quantity) : -Number(payload.quantity)),
      movements: [
        ...inventoryItem.movements,
        {
          id: inventoryItem.movements.length + 1,
          created_at: '2026-03-12T12:00:00Z',
          document_number: payload.movement_type === 'in' ? 'PR-001' : 'VD-001',
          movement_type: payload.movement_type,
          quantity: payload.quantity,
          document_reference: payload.document_reference ?? null,
          document_date: `${payload.document_date}T00:00:00Z`,
          note: payload.note ?? null,
        },
      ],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
  });
  await page.route('**/api/v1/inventory/*/pictogram', async (route) => {
    inventoryPictogramUploaded = true;
    inventoryItem = {
      ...inventoryItem,
      pictogram_path: '/media/inventory/original/inventory-42.png',
      pictogram_thumb_path: '/media/inventory/thumb/inventory-42.webp',
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
  });
  await page.route('**/api/v1/inventory/*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
      return;
    }
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      inventoryItem = { ...inventoryItem, ...payload };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryItem) });
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/v1/reports', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reports) });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const created = { id: 52, created_at: '2026-03-12T13:00:00Z', updated_at: '2026-03-12T13:00:00Z', ...payload };
      reports = [...reports, created as never];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/v1/reports/*', async (route) => {
    const id = Number(route.request().url().split('/').slice(-1)[0]);
    if (route.request().method() === 'GET') {
      const item = reports.find((entry) => entry.id === id);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
      return;
    }
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const updated = { ...(reports.find((entry) => entry.id === id) ?? {}), ...payload, id, updated_at: '2026-03-12T14:00:00Z' };
      reports = reports.map((entry) => (entry.id === id ? updated as never : entry));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }
    await route.fallback();
  });

  await page.goto('/ztraty-a-nalezy');
  await expect(page.getByTestId('lost-found-list-page')).toBeVisible();
  await expect(page.getByText('Modrá šála')).toBeVisible();
  await page.getByRole('link', { name: /nová položka/i }).click();
  await page.getByLabel(/kategorie/i).fill('Elektronika');
  await page.getByLabel(/místo nálezu/i).fill('Recepce');
  await page.getByLabel(/popis položky/i).fill('Nabíječka');
  await page.getByLabel(/kontaktová/i).check();
  await page.getByRole('button', { name: /uložit/i }).click();
  await expect(page).toHaveURL(/\/ztraty-a-nalezy\/22$/);

  await page.goto('/zavady');
  await page.getByLabel(/filtr priority/i).selectOption('high');
  await page.getByRole('link', { name: /nová závada/i }).click();
  await page.getByLabel(/^název$/i).fill('Nesvítí světlo');
  await page.getByLabel(/lokalita/i).fill('Pokoj 110');
  await page.getByLabel(/popis/i).fill('Je potřeba výměna žárovky.');
  await page.getByRole('button', { name: /uložit/i }).click();
  await expect(page).toHaveURL(/\/zavady\/32$/);

  await page.goto('/sklad');
  await expect(page.getByTestId('inventory-list-page')).toContainText('Pomerančový džus');
  await page.getByRole('link', { name: /nová položka/i }).click();
  await expect(page.getByTestId('inventory-create-page')).toBeVisible();
  await expect(page.getByText(/dodavatel/i)).toHaveCount(0);
  await page.getByLabel(/^název$/i).fill('Jablečný mošt');
  await page.getByLabel(/hodnota veličiny v 1 ks/i).fill('1');
  await page.getByLabel(/minimální stav/i).fill('6');
  await page.setInputFiles('#inventory_pictogram', {
    name: 'jablecny-most.png',
    mimeType: 'image/png',
    buffer: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  await page.getByRole('button', { name: /uložit/i }).click();
  expect(inventoryPictogramUploaded).toBeTruthy();
  await expect(page).toHaveURL(/\/sklad\/42$/);
  await expect(page.getByTestId('inventory-detail-page')).toContainText('Jablečný mošt');
  await expect(page.getByText(/dodavatel/i)).toHaveCount(0);
  await page.goto('/sklad');
  await page.getByRole('link', { name: /detail/i }).first().click();
  await page.getByLabel(/počet kusů/i).first().fill('4');
  await page.getByLabel(/číslo dodacího listu/i).fill('INV-24');
  await page.getByRole('button', { name: /uložit příjem/i }).click();
  await expect(page.getByTestId('inventory-detail-page')).toContainText('PR-001');
  await page.getByLabel(/druh výdejky/i).selectOption('adjust');
  await page.getByLabel(/počet kusů/i).nth(1).fill('2');
  await page.getByRole('button', { name: /uložit výdej/i }).click();
  await expect(page.getByTestId('inventory-detail-page')).toContainText('VD-001');

  await page.goto('/hlaseni');
  await page.getByRole('link', { name: /nové hlášení/i }).click();
  await page.getByLabel(/^název$/i).fill('Ranní přehled');
  await page.getByLabel(/popis/i).fill('Obsazenost 92 %');
  await page.getByRole('button', { name: /uložit/i }).click();
  await expect(page).toHaveURL(/\/hlaseni\/52$/);
  await page.getByRole('link', { name: /upravit/i }).click();
  await page.getByLabel(/stav/i).selectOption('closed');
  await page.getByRole('button', { name: /uložit/i }).click();
  await expect(page.getByTestId('reports-detail-page')).toContainText('Ranní přehled');
  await expect(page.getByTestId('reports-detail-page')).toContainText('Obsazenost 92 %');
});

test('portal utility states and responsive navigation stay reachable', async ({ page }) => {
  await mockAuth(page, {
    email: 'recepce@example.com',
    role: 'recepce',
    roles: ['recepce'],
    permissions: ['breakfast:read', 'lost_found:read'],
    actor_type: 'portal',
  });
  await page.route('**/api/v1/lost-found**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/intro');
  await expect(page.getByRole('heading', { name: /provoz hotelu bez zbytečných přepínačů/i })).toBeVisible();
  await page.goto('/offline');
  await expect(page.getByText(/jste offline/i)).toBeVisible();
  await page.goto('/maintenance');
  await expect(page.getByText(/probíhá údržba/i)).toBeVisible();
  await page.goto('/404');
  await expect(page.getByText('404')).toBeVisible();

  await page.goto('/');
  const phoneNav = page.getByTestId('module-navigation-phone');
  await phoneNav.getByRole('button', { name: /menu/i }).click();
  await expect(phoneNav.getByRole('menuitem', { name: /snídaně/i })).toBeVisible();
  await expect(phoneNav.getByRole('menuitem', { name: /ztráty a nálezy/i })).toBeVisible();
});
