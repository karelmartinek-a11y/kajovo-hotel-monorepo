#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const repoRoot = process.cwd();
const baseRef = process.env.GITHUB_BASE_REF;
const ignorePrefixes = ['legacy/'];
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const errors = [];

const list = (cmd) =>
  execSync(cmd, { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const changedFiles = () => {
  const fallback = () => {
    const tracked = list('git diff --name-only HEAD');
    const untracked = list('git ls-files --others --exclude-standard');
    return [...new Set([...tracked, ...untracked])];
  };

  if (!baseRef) return fallback();

  try {
    execSync(`git fetch origin ${baseRef} --depth=1`, { stdio: 'ignore' });
    return list(`git diff --name-only origin/${baseRef}...HEAD`);
  } catch {
    return fallback();
  }
};

const filesToScan = changedFiles()
  .filter((file) => !ignorePrefixes.some((prefix) => file.startsWith(prefix)))
  .filter((file) => codeExtensions.has(extname(file)))
  .filter((file) => statSync(resolve(repoRoot, file), { throwIfNoEntry: false })?.isFile());

const bannedPatterns = [
  { label: 'Device endpoint (/device/*)', regex: /(["'`])\/device(?:\/|\b)/i },
  { label: 'Entity ID', regex: /\bentity\s+id\b|\bentity_id\b|\bentityId\b|\bentityid\b/i },
];

const webPageViewCrossImport = /from\s+["'][^"']*(admin|portal)\/(pages|views)\/[^"']*["']/g;
const crossAppPageViewImport = /from\s+["'][^"']*apps\/(kajovo-hotel-admin|kajovo-hotel-web)\/src\/[^"']*(pages|views)\/[^"']*["']/g;

const isAppLocalImportViolation = (filePath, statement) => {
  const normalized = filePath.replaceAll('\\\\', '/');
  const isPortalFile = normalized.includes('/portal/');
  const isAdminFile = normalized.includes('/admin/');

  if (isAdminFile && /portal\/(pages|views)\//.test(statement)) return true;
  if (isPortalFile && /admin\/(pages|views)\//.test(statement)) return true;
  return false;
};

const isCrossAppViolation = (filePath, statement) => {
  const normalized = filePath.replaceAll('\\\\', '/');
  if (normalized.startsWith('apps/kajovo-hotel-admin/')) {
    return statement.includes('apps/kajovo-hotel-web') && /(pages|views)\//.test(statement);
  }
  if (normalized.startsWith('apps/kajovo-hotel-web/')) {
    return statement.includes('apps/kajovo-hotel-admin') && /(pages|views)\//.test(statement);
  }
  return false;
};

for (const rel of filesToScan) {
  if (rel === 'apps/kajovo-hotel/ci/policy-sentinel.mjs') continue;
  const source = readFileSync(resolve(repoRoot, rel), 'utf8');

  for (const pattern of bannedPatterns) {
    if (pattern.regex.test(source)) {
      errors.push(`${pattern.label} detected in ${rel}`);
    }
  }

  const normalized = rel.replaceAll('\\\\', '/');
  const imports = source.match(webPageViewCrossImport) ?? [];
  for (const statement of imports) {
    if (isAppLocalImportViolation(normalized, statement)) {
      errors.push(`Page/view sharing is forbidden between Admin and Portal: ${rel}`);
      break;
    }
  }

  const crossAppImports = source.match(crossAppPageViewImport) ?? [];
  for (const statement of crossAppImports) {
    if (isCrossAppViolation(normalized, statement)) {
      errors.push(`Cross-app page/view import is forbidden (admin <-> portal): ${rel}`);
      break;
    }
  }
}

if (errors.length > 0) {
  console.error('Policy sentinel failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Policy sentinel passed.');
