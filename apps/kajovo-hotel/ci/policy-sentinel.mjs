#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const scanRoots = [resolve(repoRoot, 'apps'), resolve(repoRoot, 'packages')];
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'coverage', 'test-results', 'legacy']);
const errors = [];

const walk = (directory, acc = []) => {
  const dir = statSync(directory, { throwIfNoEntry: false });
  if (!dir?.isDirectory()) return acc;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue;
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, acc);
      continue;
    }
    const extension = extname(entry.name);
    if (codeExtensions.has(extension)) acc.push(fullPath);
  }

  return acc;
};

const codeFiles = scanRoots.flatMap((root) => walk(root));

const bannedPatterns = [
  { label: 'Device endpoint (/device/*)', regex: /(["'`])\/device(?:\/|\b)/i },
  { label: 'Entity ID', regex: /\bentity\s+id\b|\bentityid\b/i },
];

for (const file of codeFiles) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(repoRoot, file);
  if (rel === 'apps/kajovo-hotel/ci/policy-sentinel.mjs') continue;

  for (const pattern of bannedPatterns) {
    if (pattern.regex.test(source)) {
      errors.push(`${pattern.label} detected in ${rel}`);
    }
  }

  const normalized = rel.replaceAll('\\\\', '/');
  if (!normalized.startsWith('apps/kajovo-hotel-web/src/')) continue;

  const isAdmin = normalized.includes('/admin/');
  const isPortal = normalized.includes('/portal/');

  if (isAdmin && /portal\/(pages|views)\//.test(source)) {
    errors.push(`Admin source must not import Portal pages/views: ${rel}`);
  }
  if (isPortal && /admin\/(pages|views)\//.test(source)) {
    errors.push(`Portal source must not import Admin pages/views: ${rel}`);
  }
}

if (errors.length > 0) {
  console.error('Policy sentinel failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Policy sentinel passed.');
