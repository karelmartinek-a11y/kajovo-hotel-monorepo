import { expect, test } from '@playwright/test';

const listPayload = [
  {
    id: 1,
    service_date: '2026-02-19',
    room_number: '101',
    guest_name: 'Novák',
    guest_count: 2,
    status: 'pending',
    note: 'Bez lepku',
  },
  {
    id: 2,
    service_date: '2026-02-19',
    room_number: '205',
    guest_name: 'Svoboda',
    guest_count: 1,
    status: 'served',
    note: 'Standard',
  },
];

const summaryPayload = {
  service_date: '2026-02-19',
  total_orders: 2,
  total_guests: 3,
  status_counts: {
    pending: 1,
    preparing: 0,
    served: 1,
    cancelled: 0,
  },
};

const issuesListPayload = [
  {
    id: 1,
    title: 'Nefunkční světlo',
    description: 'Světlo v koupelně bliká',
    location: '2. patro',
    room_number: '204',
    priority: 'high',
    status: 'in_progress',
    assignee: 'Petr Údržba',
    in_progress_at: '2026-02-18T10:30:00Z',
    resolved_at: null,
    closed_at: null,
    created_at: '2026-02-18T10:00:00Z',
    updated_at: '2026-02-18T10:30:00Z',
  },
];


const inventoryListPayload = [
  {
    id: 1,
    name: 'Mléko',
    unit: 'l',
    min_stock: 10,
    current_stock: 4,
    supplier: 'FreshTrade',
    created_at: '2026-02-18T09:00:00Z',
    updated_at: '2026-02-18T09:00:00Z',
  },
  {
    id: 2,
    name: 'Káva',
    unit: 'kg',
    min_stock: 2,
    current_stock: 8,
    supplier: null,
    created_at: '2026-02-18T09:00:00Z',
    updated_at: '2026-02-18T09:00:00Z',
  },
];

const inventoryDetailPayload = {
  ...inventoryListPayload[0],
  movements: [
    {
      id: 12,
      item_id: 1,
      movement_type: 'out',
      quantity: 2,
      note: 'Snídaně',
      created_at: '2026-02-18T10:00:00Z',
    },
  ],
  audit_logs: [
    {
      id: 51,
      entity: 'item',
      entity_id: 1,
      action: 'movement',
      detail: 'Recorded movement out (2).',
      created_at: '2026-02-18T10:00:00Z',
    },
  ],
};


const reportsListPayload = [
  {
    id: 1,
    title: 'Nefunkční lampa na chodbě',
    description: '2. patro - bliká světlo před pokojem 204',
    status: 'in_progress',
    created_at: '2026-02-18T10:00:00Z',
    updated_at: '2026-02-18T11:00:00Z',
  },
  {
    id: 2,
    title: 'Poškozený koberec',
    description: null,
    status: 'open',
    created_at: '2026-02-18T09:00:00Z',
    updated_at: '2026-02-18T09:00:00Z',
  },
];

const lostFoundListPayload = [
  {
    id: 1,
    item_type: 'found',
    description: 'Černá peněženka',
    category: 'Osobní věci',
    location: 'Wellness',
    event_at: '2026-02-18T10:00:00Z',
    status: 'stored',
    claimant_name: null,
    claimant_contact: null,
    handover_note: null,
    claimed_at: null,
    returned_at: null,
  },
  {
    id: 2,
    item_type: 'lost',
    description: 'Náramek',
    category: 'Šperky',
    location: 'Pokoj 203',
    event_at: '2026-02-18T11:00:00Z',
    status: 'claimed',
    claimant_name: 'Jan Novák',
    claimant_contact: '+420777888999',
    handover_note: 'Kontaktován host',
    claimed_at: '2026-02-18T12:00:00Z',
    returned_at: null,
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/breakfast?service_date=2026-02-19', async (route) => {
    await route.fulfill({ json: listPayload });
  });

  await page.route('**/api/v1/breakfast/daily-summary?service_date=2026-02-19', async (route) => {
    await route.fulfill({ json: summaryPayload });
  });

  await page.route('**/api/v1/breakfast/1', async (route) => {
    await route.fulfill({ json: listPayload[0] });
  });


  await page.route('**/api/v1/issues?*', async (route) => {
    await route.fulfill({ json: issuesListPayload });
  });

  await page.route('**/api/v1/issues', async (route) => {
    if (route.request().method() === 'POST') {
      const body = await route.request().postDataJSON();
      await route.fulfill({ json: { ...issuesListPayload[0], ...body, id: 2 } });
      return;
    }
    await route.fulfill({ json: issuesListPayload });
  });

  await page.route('**/api/v1/issues/1', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = await route.request().postDataJSON();
      await route.fulfill({ json: { ...issuesListPayload[0], ...body, id: 1 } });
      return;
    }
    await route.fulfill({ json: issuesListPayload[0] });
  });


  await page.route('**/api/v1/inventory?*', async (route) => {
    await route.fulfill({ json: inventoryListPayload });
  });

  await page.route('**/api/v1/inventory', async (route) => {
    if (route.request().method() === 'POST') {
      const body = await route.request().postDataJSON();
      await route.fulfill({ json: { ...body, id: 3, created_at: '2026-02-18T11:00:00Z', updated_at: '2026-02-18T11:00:00Z' } });
      return;
    }
    await route.fulfill({ json: inventoryListPayload });
  });

  await page.route('**/api/v1/inventory/1/movements', async (route) => {
    const body = await route.request().postDataJSON();
    await route.fulfill({ json: { ...inventoryDetailPayload, current_stock: body.movement_type === 'out' ? 2 : 6 } });
  });

  await page.route('**/api/v1/inventory/1', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = await route.request().postDataJSON();
      await route.fulfill({ json: { ...inventoryListPayload[0], ...body, id: 1 } });
      return;
    }
    await route.fulfill({ json: inventoryDetailPayload });
  });


  await page.route('**/api/v1/reports?*', async (route) => {
    await route.fulfill({ json: reportsListPayload });
  });

  await page.route('**/api/v1/reports', async (route) => {
    if (route.request().method() === 'POST') {
      const body = await route.request().postDataJSON();
      await route.fulfill({ json: { ...reportsListPayload[0], ...body, id: 3 } });
      return;
    }
    await route.fulfill({ json: reportsListPayload });
  });

  await page.route('**/api/v1/reports/1', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = await route.request().postDataJSON();
      await route.fulfill({ json: { ...reportsListPayload[0], ...body, id: 1 } });
      return;
    }
    await route.fulfill({ json: reportsListPayload[0] });
  });

  await page.route('**/api/v1/lost-found?*', async (route) => {
    await route.fulfill({ json: lostFoundListPayload });
  });

  await page.route('**/api/v1/lost-found', async (route) => {
    if (route.request().method() === 'POST') {
      const body = await route.request().postDataJSON();
      await route.fulfill({ json: { ...body, id: 3 } });
      return;
    }
    await route.fulfill({ json: lostFoundListPayload });
  });

  await page.route('**/api/v1/lost-found/1', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = await route.request().postDataJSON();
      await route.fulfill({ json: { ...lostFoundListPayload[0], ...body, id: 1 } });
      return;
    }
    await route.fulfill({ json: lostFoundListPayload[0] });
  });
});

test.describe('visual states', () => {
  for (const viewport of [
    { name: 'phone', size: { width: 390, height: 844 } },
    { name: 'tablet', size: { width: 820, height: 1180 } },
    { name: 'desktop', size: { width: 1440, height: 900 } },
  ]) {
    test(`lost found list snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/ztraty-a-nalezy');
      await expect(page.getByTestId('lost-found-list-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`lost-found-list-${viewport.name}.png`, { fullPage: true });
    });

    test(`lost found detail snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/ztraty-a-nalezy/1');
      await expect(page.getByTestId('lost-found-detail-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`lost-found-detail-${viewport.name}.png`, { fullPage: true });
    });

    test(`lost found edit snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/ztraty-a-nalezy/1/edit');
      await expect(page.getByTestId('lost-found-edit-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`lost-found-edit-${viewport.name}.png`, { fullPage: true });
    });


    test(`inventory list snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/sklad');
      await expect(page.getByTestId('inventory-list-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`inventory-list-${viewport.name}.png`, { fullPage: true });
    });

    test(`inventory detail snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/sklad/1');
      await expect(page.getByTestId('inventory-detail-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`inventory-detail-${viewport.name}.png`, { fullPage: true });
    });

    test(`inventory edit snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/sklad/1/edit');
      await expect(page.getByTestId('inventory-edit-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`inventory-edit-${viewport.name}.png`, { fullPage: true });
    });


    test(`reports list snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/hlaseni');
      await expect(page.getByTestId('reports-list-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`reports-list-${viewport.name}.png`, { fullPage: true });
    });

    test(`reports detail snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/hlaseni/1');
      await expect(page.getByTestId('reports-detail-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`reports-detail-${viewport.name}.png`, { fullPage: true });
    });

    test(`reports edit snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/hlaseni/1/edit');
      await expect(page.getByTestId('reports-edit-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`reports-edit-${viewport.name}.png`, { fullPage: true });
    });

    test(`issues list snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/zavady');
      await expect(page.getByTestId('issues-list-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`issues-list-${viewport.name}.png`, { fullPage: true });
    });

    test(`issues detail snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/zavady/1');
      await expect(page.getByTestId('issues-detail-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`issues-detail-${viewport.name}.png`, { fullPage: true });
    });

    test(`issues edit snapshot ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto('/zavady/1/edit');
      await expect(page.getByTestId('issues-edit-page')).toBeVisible();
      await expect(page).toHaveScreenshot(`issues-edit-${viewport.name}.png`, { fullPage: true });
    });

  }

  test('dashboard snapshot', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page).toHaveScreenshot('dashboard.png', { fullPage: true });
  });

  test('breakfast list snapshot', async ({ page }) => {
    await page.goto('/snidane');
    await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
    await expect(page).toHaveScreenshot('breakfast-list.png', { fullPage: true });
  });

  test('breakfast detail snapshot', async ({ page }) => {
    await page.goto('/snidane/1');
    await expect(page.getByTestId('breakfast-detail-page')).toBeVisible();
    await expect(page).toHaveScreenshot('breakfast-detail.png', { fullPage: true });
  });

  test('breakfast edit snapshot', async ({ page }) => {
    await page.goto('/snidane/1/edit');
    await expect(page.getByTestId('breakfast-edit-page')).toBeVisible();
    await expect(page).toHaveScreenshot('breakfast-edit.png', { fullPage: true });
  });

  test('signage stays visible while scrolling', async ({ page }) => {
    await page.goto('/ztraty-a-nalezy');
    const sign = page.getByTestId('kajovo-sign');
    await expect(sign).toBeVisible();
    const before = await sign.boundingBox();
    await page.mouse.wheel(0, 5000);
    const after = await sign.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    if (before && after) {
      expect(Math.round(before.y)).toBe(Math.round(after.y));
      expect(Math.round(before.x)).toBe(Math.round(after.x));
    }
  });
});
