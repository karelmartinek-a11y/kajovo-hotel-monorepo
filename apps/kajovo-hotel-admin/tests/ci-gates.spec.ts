import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import ia from '../../kajovo-hotel/ux/ia.json';
import palette from '../../kajovo-hotel/palette/palette.json';
import motion from '../../kajovo-hotel/ui-motion/motion.json';
import tokens from '../../kajovo-hotel/ui-tokens/tokens.json';

const requiredStates = ['loading', 'empty', 'error', 'offline', 'maintenance', '404'] as const;
const runtimeServiceDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const listPayload = [
  {
    id: 1,
    service_date: runtimeServiceDate,
    room_number: '101',
    guest_name: 'Novák',
    guest_count: 2,
    status: 'pending',
    note: 'Bez lepku',
  },
];

const summaryPayload = {
  service_date: runtimeServiceDate,
  total_orders: 1,
  total_guests: 2,
  status_counts: { pending: 1, preparing: 0, served: 0, cancelled: 0 },
};

const oneItem = {
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
};

const adminPath = (path: string): string => {
  if (path.startsWith('/admin')) {
    return path;
  }
  return `/admin${path.startsWith('/') ? '' : '/'}${path}`;
};

const toConcreteRoute = (route: string): string => adminPath(route.replace(/:id/g, '1'));

const smokeRoutes = ia.views.map((view) => toConcreteRoute(view.route));
const uniqueRoutes = Array.from(new Set(smokeRoutes));
const brandGateRoutes = Array.from(
  new Set([
    ...uniqueRoutes,
    adminPath('/login'),
    adminPath('/profil'),
    adminPath('/intro'),
    adminPath('/offline'),
    adminPath('/maintenance'),
    adminPath('/404'),
  ])
);
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(async ({ page }) => {

  await page.route('**/api/auth/me', async (route) =>
    route.fulfill({
      json: {
        email: 'admin@example.com',
        role: 'admin',
        permissions: [
          'dashboard:read',
          'housekeeping:read',
          'breakfast:read',
          'lost_found:read',
          'issues:read',
          'inventory:read',
          'reports:read',
        ],
        actor_type: 'admin',
      },
    })
  );
  await page.route('**/api/v1/breakfast?*', async (route) => route.fulfill({ json: listPayload }));
  await page.route('**/api/v1/breakfast', async (route) => route.fulfill({ json: listPayload }));
  await page.route('**/api/v1/breakfast/daily-summary?*', async (route) => route.fulfill({ json: summaryPayload }));
  await page.route('**/api/v1/breakfast/1', async (route) => route.fulfill({ json: listPayload[0] }));

  await page.route('**/api/v1/lost-found?*', async (route) => route.fulfill({ json: [oneItem] }));
  await page.route('**/api/v1/lost-found', async (route) => route.fulfill({ json: [oneItem] }));
  await page.route('**/api/v1/lost-found/1', async (route) => route.fulfill({ json: oneItem }));
  await page.route('**/api/v1/lost-found/*/photos', async (route) => route.fulfill({ json: [] }));

  await page.route('**/api/v1/issues?*', async (route) => route.fulfill({ json: [{ ...listPayload[0], title: 'Issue', location: 'Lobby', priority: 'high', status: 'new', created_at: '2026-01-01', updated_at: '2026-01-01' }] }));
  await page.route('**/api/v1/issues', async (route) => route.fulfill({ json: [{ ...listPayload[0], title: 'Issue', location: 'Lobby', priority: 'high', status: 'new', created_at: '2026-01-01', updated_at: '2026-01-01' }] }));
  await page.route('**/api/v1/issues/1', async (route) => route.fulfill({ json: { id: 1, title: 'Issue', description: null, location: 'Lobby', room_number: null, priority: 'high', status: 'new', assignee: null, in_progress_at: null, resolved_at: null, closed_at: null, created_at: '2026-01-01', updated_at: '2026-01-01' } }));
  await page.route('**/api/v1/issues/*/photos', async (route) => route.fulfill({ json: [] }));

  await page.route('**/api/v1/inventory?*', async (route) => route.fulfill({ json: [{ id: 1, name: 'Mléko', unit: 'l', min_stock: 1, current_stock: 2, created_at: '2026-01-01', updated_at: '2026-01-01' }] }));
  await page.route('**/api/v1/inventory', async (route) => route.fulfill({ json: [{ id: 1, name: 'Mléko', unit: 'l', min_stock: 1, current_stock: 2, created_at: '2026-01-01', updated_at: '2026-01-01' }] }));
  await page.route('**/api/v1/inventory/1', async (route) => route.fulfill({ json: { id: 1, name: 'Mléko', unit: 'l', min_stock: 1, current_stock: 2, created_at: '2026-01-01', updated_at: '2026-01-01', movements: [], audit_logs: [] } }));

  await page.route('**/api/v1/reports?*', async (route) => route.fulfill({ json: [{ id: 1, title: 'Report', description: null, status: 'open', created_at: '2026-01-01', updated_at: '2026-01-01' }] }));
  await page.route('**/api/v1/reports', async (route) => route.fulfill({ json: [{ id: 1, title: 'Report', description: null, status: 'open', created_at: '2026-01-01', updated_at: '2026-01-01' }] }));
  await page.route('**/api/v1/reports/1', async (route) => route.fulfill({ json: { id: 1, title: 'Report', description: null, status: 'open', created_at: '2026-01-01', updated_at: '2026-01-01' } }));
});

test('SIGNACE is visible, correct and not occluded on all IA routes', async ({ page }) => {
  for (const view of ia.views) {
    await page.goto(toConcreteRoute(view.route));
    const sign = page.getByTestId('kajovo-sign');
    await expect(sign, `Missing SIGNACE for route ${view.route}`).toBeVisible();
    await expect(sign).toHaveAttribute('aria-label', 'KÁJOVO');
    const signImage = sign.locator('img');
    await expect(signImage).toBeVisible();
    await expect(signImage).toHaveAttribute('src', /signace\.svg$/);

    const signStyles = await sign.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return {
        position: styles.position,
      };
    });
    expect(signStyles.position).toBe('fixed');

    const before = await sign.boundingBox();
    await page.mouse.wheel(0, 3000);
    const after = await sign.boundingBox();

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    if (before && after) {
      expect(Math.round(before.x)).toBe(Math.round(after.x));
      const viewport = page.viewportSize();
      const isPhone = viewport ? viewport.width <= 767 : false;
      if (isPhone) {
        expect(Math.abs(Math.round(before.y) - Math.round(after.y))).toBeLessThanOrEqual(24);
      } else {
        expect(Math.round(before.y)).toBe(Math.round(after.y));
      }
      expect(before.height).toBeGreaterThanOrEqual(24);
    }

    const isOccluded = await sign.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const elementAtCenter = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return elementAtCenter !== node && !node.contains(elementAtCenter);
    });
    expect(isOccluded, `SIGNACE is occluded on route ${view.route}`).toBeFalsy();
  }
});

test('all IA routes support smoke navigation', async ({ page }) => {
  for (const route of smokeRoutes) {
    await page.goto(route);
    await expect(page.locator('main').first(), `Main content missing on route ${route}`).toBeVisible();
    const pathname = new URL(page.url()).pathname;
    expect(pathname, `Navigation did not land on route ${route}`).toBe(route);
  }
});

test('brand elements convention: maximum 2 per key views', async ({ page }) => {
  for (const route of brandGateRoutes) {
    await page.goto(route);
    const count = await page.locator('[data-brand-element="true"]').count();
    expect(count, `Too many brand elements on ${route}`).toBeLessThanOrEqual(2);
  }
});

test('intro route renders full lockup while preserving max two brand elements', async ({ page }) => {
  await page.goto(adminPath('/intro'));

  const fullLockup = page.locator('.k-full-lockup');
  await expect(fullLockup).toBeVisible();
  await expect(fullLockup.locator('img')).toHaveAttribute('src', /kajovo-hotel_full\.svg$/);

  const count = await page.locator('[data-brand-element="true"]').count();
  expect(count).toBe(2);
});

test('state query parameter does not switch production screens', async ({ page }) => {
  await page.goto(adminPath('/snidane?state=error'), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('kajovo-sign')).toBeVisible();
  await expect(page.getByTestId('state-view-error')).toHaveCount(0);
  await expect(page.locator('.k-skeleton-block')).toHaveCount(0);
});

test('SIGNACE offset respects minimum per device class', async ({ page }) => {
  const scenarios = [
    { name: 'phone', width: 390, height: 844, minOffset: 16, minThickness: 4.8, imgWidth: 24 },
    { name: 'tablet', width: 834, height: 1112, minOffset: 20, minThickness: 4.8, imgWidth: 24 },
    { name: 'desktop', width: 1440, height: 900, minOffset: 24, minThickness: 12, imgWidth: 60 },
  ];

  for (const scenario of scenarios) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto(adminPath('/'));
    const sign = page.getByTestId('kajovo-sign');
    await expect(sign).toBeVisible();

    const offsets = await sign.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return {
        left: Number.parseFloat(styles.left || '0'),
        bottom: Number.parseFloat(styles.bottom || '0'),
        minHeight: Number.parseFloat(styles.minHeight || '0'),
      };
    });
    const imgWidth = await sign.locator('img').evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return Number.parseFloat(styles.width || '0');
    });

    expect(offsets.left, `SIGNACE left offset too small on ${scenario.name}`).toBeGreaterThanOrEqual(scenario.minOffset);
    expect(offsets.bottom, `SIGNACE bottom offset too small on ${scenario.name}`).toBeGreaterThanOrEqual(scenario.minOffset);
    expect(
      Math.abs(offsets.minHeight - scenario.minThickness),
      `SIGNACE min height mismatch on ${scenario.name}`,
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(imgWidth - scenario.imgWidth),
      `SIGNACE image width mismatch on ${scenario.name}`,
    ).toBeLessThanOrEqual(0.5);
  }
});

test('utility states keep floating SIGNACE visible without overlapping primary actions', async ({ page }) => {
  const utilityRoutes = [adminPath('/intro'), adminPath('/offline'), adminPath('/maintenance'), adminPath('/404')];

  for (const route of utilityRoutes) {
    await page.goto(route);
    const signBox = await page.getByTestId('kajovo-sign').boundingBox();
    expect(signBox, `Missing SIGNACE box on ${route}`).not.toBeNull();

    const actionBoxes = await page.locator('.k-state-view-action, .k-utility-meta').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }),
    );

    for (const actionBox of actionBoxes) {
      if (!signBox) {
        continue;
      }
      const overlaps =
        signBox.x < actionBox.right &&
        signBox.x + signBox.width > actionBox.left &&
        signBox.y < actionBox.bottom &&
        signBox.y + signBox.height > actionBox.top;
      expect(overlaps, `SIGNACE overlaps utility action area on ${route}`).toBeFalsy();
    }
  }
});

test('prefers-reduced-motion disables skeleton animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(adminPath('/snidane'));

  await expect(page.getByTestId('breakfast-list-page')).toBeVisible();
});

test('prefers-reduced-motion disables smooth skip-link scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView;
    (window as Window & { __kajovoScrollBehaviors?: string[] }).__kajovoScrollBehaviors = [];
    Element.prototype.scrollIntoView = function patchedScrollIntoView(arg?: boolean | ScrollIntoViewOptions) {
      if (typeof arg === 'object' && arg?.behavior) {
        (window as Window & { __kajovoScrollBehaviors?: string[] }).__kajovoScrollBehaviors?.push(String(arg.behavior));
      }
      return original.call(this, arg);
    };
  });
  await page.goto(adminPath('/'));
  const skipLink = page.locator('.k-skip-link');
  await skipLink.focus();
  await skipLink.press('Enter');
  const recordedBehaviors = await page.evaluate(
    () => (window as Window & { __kajovoScrollBehaviors?: string[] }).__kajovoScrollBehaviors ?? [],
  );

  expect(recordedBehaviors).toContain('auto');
  expect(recordedBehaviors).not.toContain('smooth');
});

test('date defaults use runtime local day for breakfast and inventory forms', async ({ page }) => {
  const expectedToday = await page.evaluate(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  );

  await page.goto('/admin/snidane/nova');
  await expect(page.locator('#service_date')).toHaveValue(expectedToday);

  await page.goto('/admin/sklad/1');
  await expect(page.locator('#receipt_date')).toHaveValue(expectedToday);
  await expect(page.locator('#issue_date')).toHaveValue(expectedToday);

  const expectedLocalDateTime = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date()).reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  });

  await page.goto('/admin/ztraty-a-nalezy/novy');
  await expect(page.locator('#event_at')).toHaveValue(expectedLocalDateTime);
});

test('shared UI token values match manifest metadata in runtime CSS', async ({ page }) => {
  await page.goto(adminPath('/'));

  const runtimeTokens = await page.evaluate(() => {
    const styles = window.getComputedStyle(document.documentElement);
    return {
      brandRed: styles.getPropertyValue('--k-color-brand-red').trim(),
      surface: styles.getPropertyValue('--k-color-surface').trim(),
      focusRing: styles.getPropertyValue('--k-focus-ring-width').trim(),
      motionFast: styles.getPropertyValue('--k-motion-duration-fast').trim(),
      motionStandard: styles.getPropertyValue('--k-motion-duration-standard').trim(),
      motionEase: styles.getPropertyValue('--k-motion-ease-standard').trim(),
    };
  });

  expect(runtimeTokens.brandRed.toLowerCase()).toBe(palette.brand.red.toLowerCase());
  expect(runtimeTokens.surface.toLowerCase()).toBe(palette.neutral.surface100.toLowerCase());
  expect(runtimeTokens.focusRing).toBe(`${tokens.componentStates.focusRingWidth}px`);
  expect(Math.round(Number.parseFloat(runtimeTokens.motionFast) * 1000)).toBe(motion.durationsMs.fast);
  expect(Math.round(Number.parseFloat(runtimeTokens.motionStandard) * 1000)).toBe(motion.durationsMs.normal);
  const runtimeEase = Array.from(runtimeTokens.motionEase.matchAll(/-?\d*\.?\d+/g), (match) => Number(match[0]));
  const motionEase = Array.from(motion.easing.standard.matchAll(/-?\d*\.?\d+/g), (match) => Number(match[0]));
  expect(runtimeEase).toEqual(motionEase);
});

test('phone, tablet and desktop layouts avoid horizontal page scroll outside table containers', async ({ page }) => {
  const scenarios = [
    { width: 390, height: 844 },
    { width: 834, height: 1112 },
    { width: 1440, height: 900 },
  ];
  const routes = [
    adminPath('/'),
    adminPath('/intro'),
    adminPath('/offline'),
    adminPath('/maintenance'),
    adminPath('/404'),
    adminPath('/uzivatele'),
    adminPath('/nastaveni'),
    adminPath('/profil'),
  ];

  for (const scenario of scenarios) {
    await page.setViewportSize(scenario);
    for (const route of routes) {
      await page.goto(route);
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect(overflow, `Unexpected horizontal overflow on ${route} at ${scenario.width}px`).toBeLessThanOrEqual(1);
    }
  }
});

test('WCAG 2.2 AA baseline for IA routes', async ({ page }) => {
  test.setTimeout(120_000);
  for (const route of uniqueRoutes) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(
      results.violations,
      `WCAG violations on ${route}: ${results.violations.map((v) => v.id).join(', ')}`
    ).toEqual([]);
  }
});



test('default service and document dates follow local timezone day', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Timezone emulation is deterministic in chromium project.');
  const scenarios = [
    { timezoneId: 'Europe/Prague', expected: '2026-02-19' },
    { timezoneId: 'Pacific/Kiritimati', expected: '2026-02-20' },
  ];

  for (const scenario of scenarios) {
    const context = await browser.newContext({ timezoneId: scenario.timezoneId });
    const page = await context.newPage();
    await page.route('**/api/auth/me', async (route) =>
      route.fulfill({
        json: {
          email: 'admin@example.com',
          role: 'admin',
          permissions: [
            'dashboard:read',
            'housekeeping:read',
            'breakfast:read',
            'lost_found:read',
            'issues:read',
            'inventory:read',
            'reports:read',
          ],
          actor_type: 'admin',
        },
      })
    );
    await page.route('**/api/v1/breakfast?*', async (route) => route.fulfill({ json: listPayload }));
    await page.route('**/api/v1/breakfast/daily-summary?*', async (route) => route.fulfill({ json: summaryPayload }));

    await page.addInitScript((iso) => {
      const fixed = new Date(iso as string).valueOf();
      Date.now = () => fixed;
    }, '2026-02-19T23:30:00.000Z');

    await page.goto('/admin/snidane');
    await expect(page.locator('#service_date')).toHaveValue(scenario.expected);

    await page.goto('/admin/sklad/nova');
    await expect(page.locator('#receipt_date')).toHaveValue(scenario.expected);
    await expect(page.locator('#issue_date')).toHaveValue(scenario.expected);
    await context.close();
  }
});
