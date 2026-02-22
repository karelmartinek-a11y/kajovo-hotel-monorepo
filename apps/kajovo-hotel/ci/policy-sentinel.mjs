#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const baseRef = process.env.GITHUB_BASE_REF;
const ignorePrefixes = ['legacy/'];
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const errors = [];

const changedFiles = () => {
  const fallback = () => {
    const tracked = execSync('git diff --name-only HEAD', { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return [...new Set([...tracked, ...untracked])];
  };

  if (!baseRef) return fallback();

  try {
    execSync(`git fetch origin ${baseRef} --depth=1`, { stdio: 'ignore' });
    return execSync(`git diff --name-only origin/${baseRef}...HEAD`, { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
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

const crossImportPattern = /from\s+["'][^"']*(admin|portal)\/(pages|views)\/[^"']*["']/g;

for (const rel of filesToScan) {
  if (rel === 'apps/kajovo-hotel/ci/policy-sentinel.mjs') continue;
  const source = readFileSync(resolve(repoRoot, rel), 'utf8');

  for (const pattern of bannedPatterns) {
    if (pattern.regex.test(source)) {
      errors.push(`${pattern.label} detected in ${rel}`);
    }
  }

  const normalized = rel.replaceAll('\\\\', '/');
  if (!normalized.startsWith('apps/kajovo-hotel-web/src/')) continue;

  const isAdminFile = normalized.includes('/admin/');
  const isPortalFile = normalized.includes('/portal/');

  if (!isAdminFile && !isPortalFile) continue;

  const imports = source.match(crossImportPattern) ?? [];
  for (const statement of imports) {
    if (isAdminFile && /portal\/(pages|views)\//.test(statement)) {
      errors.push(`Admin source must not import Portal pages/views: ${rel}`);
      break;
    }
    if (isPortalFile && /admin\/(pages|views)\//.test(statement)) {
      errors.push(`Portal source must not import Admin pages/views: ${rel}`);
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
