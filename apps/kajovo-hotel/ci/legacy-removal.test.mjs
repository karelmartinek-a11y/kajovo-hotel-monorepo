import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

test('AGENTS.md uz neblokuje web legacy Androidem', () => {
  const content = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  assert.ok(content.includes('Povinný forenzní průzkum před změnou'));
  assert.ok(content.includes('Atomická synchronizace každé změny'));
  assert.ok(content.includes('Android není součástí tohoto repozitáře'));
  assert.ok(!content.includes('Neporusitelne Pravidlo Web Android Parity'));
  assert.ok(!content.includes('android-release'));
});

test('current-state dokumentace nema historicke SSOT a auditni ballast', () => {
  const requiredFiles = [
    'docs/SSOT_SCOPE_STATUS.md',
    'docs/SSOT_CURRENT.md',
    'docs/current-state-manifest.yaml',
  ];
  for (const rel of requiredFiles) {
    assert.ok(fs.existsSync(path.join(repoRoot, rel)), `Missing current-state file ${rel}`);
  }

  const removedFiles = [
    'AUDIT_VERIFICATION_EVIDENCE.md',
    'AUDIT_VERIFICATION_REPORT.md',
    'AUDIT_VERIFICATION_SUMMARY.md',
    'CHANGES_MADE.md',
    'docs/legacy-inventory.md',
    'docs/migration-map.md',
    'docs/cutover-plan.md',
    'docs/cutover-runbook.md',
    'docs/runbook/cutover.md',
    'docs/forensic-audit-2026-03-28-repo-hygiene.md',
  ];
  for (const rel of removedFiles) {
    assert.ok(!fs.existsSync(path.join(repoRoot, rel)), `Historical file still present: ${rel}`);
  }
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
