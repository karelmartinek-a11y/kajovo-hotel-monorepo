#!/usr/bin/env node
import { execSync } from 'node:child_process';

const verificationRegex = /^docs\/regen\/\d{2}[^/]*\/verification\.md$/;
const baseRef = process.env.GITHUB_BASE_REF;

const getChangedFiles = () => {
  if (baseRef) {
    try {
      execSync(`git fetch origin ${baseRef} --depth=1`, { stdio: 'ignore' });
      return execSync(`git diff --name-only origin/${baseRef}...HEAD`, { encoding: 'utf8' })
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      console.warn('Warning: unable to fetch origin base ref, using local diff fallback.');
    }
  }

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

const changed = getChangedFiles();
const hasVerificationDoc = changed.some((path) => verificationRegex.test(path));

if (!hasVerificationDoc) {
  console.error('Missing docs/regen/<NN>-<slug>/verification.md in current changes.');
  process.exit(1);
}

console.log('Verification doc gate passed.');
