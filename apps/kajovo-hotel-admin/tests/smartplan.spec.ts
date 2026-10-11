import {expect, test} from '@playwright/test';
import {getAdminCredentials} from '../test-admin-credentials';

test('owner connection uses authenticated API without starting provider or microphone', async ({page}, info) => {
  const forbidden: string[] = [];
  page.on('request', request => {
    if (/api\.openai\.com|\/voice-core\/sessions|\/voice-core\/calls/.test(request.url())) forbidden.push(request.url());
  });
  const credentials = getAdminCredentials();
  await page.goto('/admin/login');
  await page.getByLabel(/e-mail administrátora/i).fill(credentials.email);
  await page.getByLabel(/heslo administrátora/i).fill(credentials.password);
  await page.getByRole('button', {name: /přihlásit/i}).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  const statusResponse = page.waitForResponse(response => response.url().endsWith('/voice-core/smartplan'));
  await page.goto('/admin/hlasovy-chat');
  const initial = (await (await statusResponse).json()).status;
  expect(['owner_link_required', 'ready']).toContain(initial);
  const panel = page.getByRole('region', {name: 'SmartPlan', exact: true});
  expect((await panel.getByRole('button', {name: 'Ověřit propojení'}).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  if (initial === 'owner_link_required') {
  await expect(panel).toContainText('propojte tento hlasový účet');
  const linking = page.waitForResponse(response => response.url().endsWith('/smartplan/link'));
  await panel.getByRole('button', {name: 'Propojit účet SmartPlanu'}).click();
  const linked = await linking;
  expect(await linked.json()).toMatchObject({status: 'owner_link_required'});
  const link = panel.getByRole('link', {name: 'Přihlásit se a potvrdit propojení ve SmartPlanu'});
  await expect(link).toHaveAttribute('href', 'https://smartplan.hcasc.cz/link/fixture-link');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await panel.getByRole('button', {name: 'Ověřit propojení'}).click();
  await expect(panel).toContainText('SmartPlan je propojený');
  await expect(panel.getByRole('button', {name: 'Propojit účet SmartPlanu'})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('body').textContent()).not.toContain('isolated-smartplan-ui-credential');
  expect(forbidden).toEqual([]);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({path: info.outputPath('smartplan-owner-connection.png'), fullPage: true});
});
