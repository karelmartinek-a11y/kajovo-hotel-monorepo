import assert from 'node:assert/strict';
import test from 'node:test';

import { collectPolicyErrors } from './policy-rules.mjs';

test('zablokuje jednostrannou runtime zmenu webu bez Androidu', () => {
  const errors = collectPolicyErrors({
    allChangedFiles: ['apps/kajovo-hotel-web/src/portal/Home.tsx'],
    filesToScan: [],
    readSource: () => '',
  });

  assert.ok(errors.includes('Runtime zmena webu bez adekvatni runtime zmeny Android appky je zakazana.'));
});

test('zablokuje jednostrannou runtime zmenu Androidu bez webu', () => {
  const errors = collectPolicyErrors({
    allChangedFiles: ['android/feature/issues/src/main/java/cz/hcasc/kajovohotel/feature/issues/IssuesScreen.kt'],
    filesToScan: [],
    readSource: () => '',
  });

  assert.ok(errors.includes('Runtime zmena Android appky bez adekvatni runtime zmeny webu je zakazana.'));
});

test('povoli navazanou runtime zmenu na obou platformach', () => {
  const errors = collectPolicyErrors({
    allChangedFiles: [
      'apps/kajovo-hotel-web/src/portal/Home.tsx',
      'android/feature/issues/src/main/java/cz/hcasc/kajovohotel/feature/issues/IssuesScreen.kt',
    ],
    filesToScan: [],
    readSource: () => '',
  });

  assert.equal(errors.length, 0);
});

test('povoli Android release fix navazany na webovy download artefakt', () => {
  const errors = collectPolicyErrors({
    allChangedFiles: [
      'apps/kajovo-hotel-web/public/downloads/kajovo-hotel-android.apk',
      'android/core/model/src/main/java/cz/hcasc/kajovohotel/core/model/PortalRole.kt',
      'android/release/android-release.json',
    ],
    filesToScan: [],
    readSource: () => '',
  });

  assert.equal(errors.length, 0);
});
