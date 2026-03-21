#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import { collectPolicyErrors } from './policy-rules.mjs';

const repoRoot = process.cwd();
const baseRef = process.env.GITHUB_BASE_REF;
const githubEventName = process.env.GITHUB_EVENT_NAME;
const githubEventPath = process.env.GITHUB_EVENT_PATH;
const ignorePrefixes = ['legacy/'];
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);

const list = (cmd) =>
  execSync(cmd, { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const hasCommit = (sha) => {
  if (!sha) return false;
  const completed = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return completed.status === 0 && completed.stdout.trim().length > 0;
};

const changedFiles = () => {
  const localScan = () => {
    const tracked = list('git diff --name-only HEAD');
    const untracked = list('git ls-files --others --exclude-standard');
    return [...new Set([...tracked, ...untracked])];
  };

  if (baseRef) {
    try {
      execSync(`git fetch origin ${baseRef} --depth=1`, { stdio: 'ignore' });
      return list(`git diff --name-only origin/${baseRef}...HEAD`);
    } catch {
      // fallback handled below
    }
  }

  if (githubEventName === 'push' && githubEventPath) {
    try {
      const eventPayload = JSON.parse(readFileSync(githubEventPath, 'utf8'));
      const before = String(eventPayload.before || '').trim();
      if (before && !/^0+$/.test(before) && hasCommit(before)) {
        return list(`git diff --name-only ${before}...HEAD`);
      }
    } catch {
      // fallback handled below
    }
  }

  return localScan();
};

const allChangedFiles = changedFiles()
  .filter((file) => !ignorePrefixes.some((prefix) => file.startsWith(prefix)));

const filesToScan = allChangedFiles
  .filter((file) => codeExtensions.has(extname(file)))
  .filter((file) => statSync(resolve(repoRoot, file), { throwIfNoEntry: false })?.isFile());

const errors = collectPolicyErrors({
  allChangedFiles,
  filesToScan,
  readSource: (rel) => readFileSync(resolve(repoRoot, rel), 'utf8'),
});

if (errors.length > 0) {
  console.error('Policy sentinel failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Policy sentinel passed.');
