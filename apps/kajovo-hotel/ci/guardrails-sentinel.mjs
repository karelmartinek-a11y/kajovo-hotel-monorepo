#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { extname, resolve, dirname, normalize } from 'node:path';

const repoRoot = process.cwd();
const errors = [];

const DIFF_FILTER = 'ACMR';
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.py', '.json', '.yaml', '.yml', '.md', '.css', '.scss', '.html', '.svg']);
const policyCodeExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.py']);

const eventName = process.env.GITHUB_EVENT_NAME;
const baseSha = process.env.GITHUB_BASE_SHA;
const headSha = process.env.GITHUB_HEAD_SHA;

const run = (cmd) => execSync(cmd, { cwd: repoRoot, encoding: 'utf8' }).trim();

const listChangedFiles = () => {
  try {
    if (baseSha && headSha) {
      return run(`git diff --name-only --diff-filter=${DIFF_FILTER} ${baseSha}...${headSha}`).split('\n').filter(Boolean);
    }

    if (eventName === 'pull_request' && process.env.GITHUB_BASE_REF) {
      const mergeBase = run(`git merge-base HEAD origin/${process.env.GITHUB_BASE_REF}`);
      return run(`git diff --name-only --diff-filter=${DIFF_FILTER} ${mergeBase}...HEAD`).split('\n').filter(Boolean);
    }

    const stagedAndUnstaged = run(`git diff --name-only --diff-filter=${DIFF_FILTER}`).split('\n').filter(Boolean);
    const stagedOnly = run(`git diff --cached --name-only --diff-filter=${DIFF_FILTER}`).split('\n').filter(Boolean);
    return [...new Set([...stagedAndUnstaged, ...stagedOnly])];
  } catch {
    return [];
  }
};

const changedFiles = listChangedFiles();

const isScopedOut = (filePath) => {
  const normalized = filePath.replaceAll('\\', '/');
  return normalized.startsWith('legacy/');
};

const isBrandWhitelisted = (filePath) => filePath.replaceAll('\\', '/').startsWith('brand/');

const resolveImport = (fromFile, importPath) => {
  if (importPath.startsWith('.')) {
    const absolute = resolve(repoRoot, dirname(fromFile), importPath);
    return normalize(absolute);
  }
  if (importPath.startsWith('@/')) {
    return normalize(resolve(repoRoot, 'apps/kajovo-hotel-web/src', importPath.slice(2)));
  }
  return importPath;
};

const hasPageOrViewSegment = (value) => /(?:^|\/)(pages?|views?)(?:\/|$)/.test(value);
const isAdminPath = (value) => /(?:^|\/)admin(?:\/|$)/.test(value);
const isPortalPath = (value) => /(?:^|\/)portal(?:\/|$)/.test(value);

for (const file of changedFiles) {
  const normalizedFile = file.replaceAll('\\', '/');
  if (isScopedOut(normalizedFile)) continue;

  const fullPath = resolve(repoRoot, normalizedFile);
  const extension = extname(normalizedFile).toLowerCase();
  if (!textExtensions.has(extension)) continue;
  if (!existsSync(fullPath)) continue;

  const content = readFileSync(fullPath, 'utf8');

  if (policyCodeExtensions.has(extension)) {
    if (/\bEntity ID\b/i.test(content)) {
      errors.push(`Forbidden phrase "Entity ID" found in ${normalizedFile}`);
    }

    if (/(^|[^a-zA-Z0-9_])\/device\//i.test(content) || /['"`]\/device(?:['"`]|\/)/i.test(content)) {
      errors.push(`Forbidden /device/* endpoint usage found in ${normalizedFile}`);
    }
  }

  if (!isBrandWhitelisted(normalizedFile)) {
    if (/(?:fill|stroke)\s*=\s*["']#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})["']/.test(content)) {
      errors.push(`Hardcoded SVG color is forbidden outside brand/** in ${normalizedFile}`);
    }
    if (/(?:color|background(?:-color)?|border-color|fill|stroke)\s*:\s*(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgb\(|rgba\(|hsl\(|hsla\()/i.test(content)) {
      errors.push(`Hardcoded color token is forbidden outside brand/** in ${normalizedFile}`);
    }
  }

  const normalizedForScope = `/${normalizedFile}`;
  const inAdminPageOrView = isAdminPath(normalizedForScope) && hasPageOrViewSegment(normalizedForScope);
  const inPortalPageOrView = isPortalPath(normalizedForScope) && hasPageOrViewSegment(normalizedForScope);

  if (inAdminPageOrView || inPortalPageOrView) {
    const importRegex = /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const rawImport = match[1] ?? match[2];
      if (!rawImport) continue;
      const resolvedImport = resolveImport(normalizedFile, rawImport).replaceAll('\\', '/');
      const normalizedImport = resolvedImport.startsWith('/') ? resolvedImport : `/${resolvedImport}`;

      if (inAdminPageOrView && isPortalPath(normalizedImport) && hasPageOrViewSegment(normalizedImport)) {
        errors.push(`Admin page/view must not import portal page/view (${normalizedFile} -> ${rawImport})`);
      }
      if (inPortalPageOrView && isAdminPath(normalizedImport) && hasPageOrViewSegment(normalizedImport)) {
        errors.push(`Portal page/view must not import admin page/view (${normalizedFile} -> ${rawImport})`);
      }
    }
  }
}

if (errors.length) {
  console.error('Guardrails sentinel failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Guardrails sentinel passed for ${changedFiles.length} changed files.`);
