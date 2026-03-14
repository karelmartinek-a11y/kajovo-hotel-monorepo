import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const bannedTokens = [
  '__KAJOVO_TEST_NAV__',
  'kajovo_admin_role_view',
  'fallbackAuth',
  'MockEmailService',
  'seed-defaults',
  'bootstrap-status',
];

const sourceRoots = [
  'apps/kajovo-hotel-api/app',
  'apps/kajovo-hotel-web/src',
  'apps/kajovo-hotel-admin/src',
];

const buildRoots = [
  'apps/kajovo-hotel-web/dist',
  'apps/kajovo-hotel-admin/dist',
];

const failures = [];

function visit(dir, callback) {
  if (!existsSync(dir)) {
    return;
  }
  for (const entry of readdirSync(dir)) {
    if (entry === '__pycache__') {
      continue;
    }
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      visit(fullPath, callback);
      continue;
    }
    if (fullPath.endsWith('.pyc')) {
      continue;
    }
    callback(fullPath);
  }
}

for (const dir of [...sourceRoots, ...buildRoots]) {
  visit(join(root, dir), (filePath) => {
    const content = readFileSync(filePath, 'utf8');
    for (const token of bannedTokens) {
      if (content.includes(token)) {
        failures.push(`${relative(root, filePath)} contains forbidden token ${token}`);
      }
    }
    if (dir.includes('/src') && content.includes('?state=')) {
      failures.push(`${relative(root, filePath)} contains forbidden state query switching`);
    }
  });
}

if (failures.length > 0) {
  console.error('Runtime integrity gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Runtime integrity gate passed.');
