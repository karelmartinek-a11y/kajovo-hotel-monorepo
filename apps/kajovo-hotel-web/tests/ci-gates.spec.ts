import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import ia from '../../kajovo-hotel/ux/ia.json';

const requiredStates = ['loading', 'empty', 'error', 'offline', 'maintenance', '404'] as const;

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
];

const summaryPayload = {
  service_date: '2026-02-19',
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

const toConcreteRoute = (route: string): string => route.replace(/:id/g, '1');

const smokeRoutes = ia.views.map((view) => toConcreteRoute(view.route));
const uniqueRoutes = Array.from(new Set(smokeRoutes));
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(async ({ page }) => {

  await page.route('**/api/auth/me', async (route) =>
    route.fulfill({
      json: {
        email: 'manager@example.com',
        role: 'manager',
        permissions: [
          'dashboard:read',
          'breakfast:read',
          'lost_found:read',
          'issues:read',
          'inventory:read',
          'reports:read',
        ],
        actor_type: 'portal',
      },
    })
  );
  await page.route('**/api/v1/breakfast?*', async (route) => route.fulfill({ json: listPayload }));
  await page.route('**/api/v1/breakfast/daily-summary?*', async (route) => route.fulfill({ json: summaryPayload }));
  await page.route('**/api/v1/breakfast/1', async (route) => route.fulfill({ json: listPayload[0] }));

  await page.route('**/api/v1/lost-found?*', async (route) => route.fulfill({ json: [oneItem] }));
  await page.route('**/api/v1/lost-found/1', async (route) => route.fulfill({ json: oneItem }));

  await page.route('**/api/v1/issues?*', async (route) => route.fulfill({ json: [{ ...listPayload[0], title: 'Issue', location: 'Lobby', priority: 'high', status: 'new', created_at: '2026-01-01', updated_at: '2026-01-01' }] }));
  await page.route('**/api/v1/issues/1', async (route) => route.fulfill({ json: { id: 1, title: 'Issue', description: null, location: 'Lobby', room_number: null, priority: 'high', status: 'new', assignee: null, in_progress_at: null, resolved_at: null, closed_at: null, created_at: '2026-01-01', updated_at: '2026-01-01' } }));

  await page.route('**/api/v1/inventory?*', async (route) => route.fulfill({ json: [{ id: 1, name: 'Mléko', unit: 'l', min_stock: 1, current_stock: 2, supplier: null, created_at: '2026-01-01', updated_at: '2026-01-01' }] }));
  await page.route('**/api/v1/inventory/1', async (route) => route.fulfill({ json: { id: 1, name: 'Mléko', unit: 'l', min_stock: 1, current_stock: 2, supplier: null, created_at: '2026-01-01', updated_at: '2026-01-01', movements: [], audit_logs: [] } }));

  await page.route('**/api/v1/reports?*', async (route) => route.fulfill({ json: [{ id: 1, title: 'Report', description: null, status: 'open', created_at: '2026-01-01', updated_at: '2026-01-01' }] }));
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
      expect(Math.round(before.y)).toBe(Math.round(after.y));
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
  for (const route of uniqueRoutes) {
    await page.goto(route);
    const count = await page.locator('[data-brand-element="true"]').count();
    expect(count, `Too many brand elements on ${route}`).toBeLessThanOrEqual(2);
  }
});

test('IA routes expose required view states via state test IDs', async ({ page }) => {
  const nonUtilityViews = ia.views.filter((view) => !['/intro', '/offline', '/maintenance', '/404'].includes(view.route));

  for (const view of nonUtilityViews) {
    const route = toConcreteRoute(view.route);

    for (const state of requiredStates) {
      await page.goto(`${route}?state=${state}`);
      await expect(page.getByTestId(`state-view-${state}`), `Missing ${state} state on ${view.route}`).toBeVisible();
      await expect(page.getByTestId('kajovo-sign'), `Missing SIGNACE in ${state} state on ${view.route}`).toBeVisible();
    }
  }
});

test('SIGNACE offset respects minimum per device class', async ({ page }) => {
  const scenarios = [
    { name: 'phone', width: 390, height: 844, minOffset: 16 },
    { name: 'tablet', width: 834, height: 1112, minOffset: 20 },
    { name: 'desktop', width: 1440, height: 900, minOffset: 24 },
  ];

  for (const scenario of scenarios) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto('/');
    const sign = page.getByTestId('kajovo-sign');
    await expect(sign).toBeVisible();

    const offsets = await sign.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return {
        left: Number.parseFloat(styles.left || '0'),
        bottom: Number.parseFloat(styles.bottom || '0'),
      };
    });

    expect(offsets.left, `SIGNACE left offset too small on ${scenario.name}`).toBeGreaterThanOrEqual(scenario.minOffset);
    expect(offsets.bottom, `SIGNACE bottom offset too small on ${scenario.name}`).toBeGreaterThanOrEqual(scenario.minOffset);
  }
});

test('prefers-reduced-motion disables skeleton animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?state=loading');

  const skeleton = page.locator('.k-skeleton-block').first();
  await expect(skeleton).toBeVisible();

  const animationName = await skeleton.evaluate((node) => window.getComputedStyle(node).animationName);
  expect(animationName).toBe('none');
});

test('WCAG 2.2 AA baseline for IA routes', async ({ page }) => {
  const allowedColorContrastTargets = new Set(['.kajovo-sign', '.k-nav-group-label']);

  for (const route of uniqueRoutes) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    const relevantViolations = results.violations
      .map((violation) => {
        if (violation.id !== 'color-contrast') {
          return violation;
        }

        const nodes = violation.nodes.filter((node) => {
          return !node.target.some((target) => allowedColorContrastTargets.has(String(target)));
        });

        if (!nodes.length) {
          return null;
        }

        return { ...violation, nodes };
      })
      .filter((violation): violation is typeof results.violations[number] => violation !== null);

    expect(
      relevantViolations,
      `WCAG violations on ${route}: ${relevantViolations.map((v) => v.id).join(', ')}`
    ).toEqual([]);
  }
});
