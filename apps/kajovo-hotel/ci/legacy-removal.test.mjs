import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

test('AGENTS.md uz neblokuje web legacy Androidem', () => {
  const content = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  assert.ok(content.includes('Legacy Android Stav'));
  assert.ok(!content.includes('Neporusitelne Pravidlo Web Android Parity'));
  assert.ok(!content.includes('android-release'));
});

test('aktivni runtime texty neobsahuji KájovoHotel bez mezery', () => {
  const files = [
    'apps/kajovo-hotel-web/index.html',
    'apps/kajovo-hotel-admin/index.html',
    'apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx',
    'apps/kajovo-hotel-web/src/admin/AdminLoginPage.tsx',
    'packages/shared/src/i18n/auth.ts',
    'infra/compose.prod.yml',
    'infra/compose.staging.yml',
  ];

  for (const rel of files) {
    const content = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.ok(!/KájovoHotel|KajovoHotel|Kájovo hotel|Kajovo hotel/.test(content), `Unexpected legacy branding in ${rel}`);
  }
});
