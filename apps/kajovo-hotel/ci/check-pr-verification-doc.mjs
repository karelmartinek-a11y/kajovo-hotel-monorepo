#!/usr/bin/env node
import { execSync } from 'node:child_process';

const verificationRegex = /^docs\/regen\/\d{2}[^/]*\/verification\.md$/;
const baseRef = process.env.GITHUB_BASE_REF;

if (!baseRef) {
  console.log('Verification doc gate is pull_request-only; skipping outside PR context.');
  process.exit(0);
}

const list = (cmd) => execSync(cmd, { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const changedFilesFromFallback = () => {
  const tracked = list('git diff --name-only HEAD');
  const untracked = list('git ls-files --others --exclude-standard');
  return [...new Set([...tracked, ...untracked])];
};

const getChangedFiles = () => {
  try {
    execSync(`git fetch origin ${baseRef} --depth=1`, { stdio: 'ignore' });
    return list(`git diff --name-only origin/${baseRef}...HEAD`);
  } catch {
    console.warn('Warning: unable to fetch origin base ref, using local diff fallback.');
    return changedFilesFromFallback();
  }
};

const changed = getChangedFiles();
const hasVerificationDoc = changed.some((path) => verificationRegex.test(path));

if (!hasVerificationDoc) {
  console.error('Missing docs/regen/<NN>-<slug>/verification.md in current PR changes.');
  process.exit(1);
}

console.log('Verification doc gate passed.');
