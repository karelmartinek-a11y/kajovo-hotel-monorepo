import assert from 'node:assert/strict';
import test from 'node:test';

import { collectPolicyErrors } from './policy-rules.mjs';

test('samostatna runtime zmena webu uz neni blokovana legacy Androidem', () => {
  const errors = collectPolicyErrors({
    allChangedFiles: ['apps/kajovo-hotel-web/src/portal/Home.tsx'],
    filesToScan: [],
    readSource: () => '',
  });

  assert.equal(errors.length, 0);
});

test('porad blokuje device endpointy v runtime kodu', () => {
  const errors = collectPolicyErrors({
    allChangedFiles: ['apps/kajovo-hotel-web/src/portal/Home.tsx'],
    filesToScan: ['apps/kajovo-hotel-web/src/portal/Home.tsx'],
    readSource: () => `fetch("/${'device'}/session")`,
  });

  assert.ok(errors.some((error) => error.includes('Device endpoint')));
});

test('porad blokuje krizene page/view importy mezi adminem a portalem', () => {
  const errors = collectPolicyErrors({
    allChangedFiles: ['apps/kajovo-hotel-web/src/portal/Home.tsx'],
    filesToScan: ['apps/kajovo-hotel-web/src/portal/Home.tsx'],
    readSource: () => 'import view from "apps/kajovo-hotel-admin/src/pages/UsersView"',
  });

  assert.ok(errors.some((error) => error.includes('Cross-app page/view import')));
});
