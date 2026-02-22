#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const regenDirRegex = /^docs\/regen\/(\d{2}[^/]+)\//;
const verificationRegex = /^docs\/regen\/\d{2}[^/]*\/verification\.md$/;
const baseRef = process.env.GITHUB_BASE_REF;

if (!baseRef) {
  console.log('Verification doc gate is pull_request-only; skipping outside PR context.');
  process.exit(0);
}

const list = (cmd) =>
  execSync(cmd, { encoding: 'utf8' })
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

const assertRequiredSections = (path) => {
  const content = readFileSync(path, 'utf8');
  const headingLines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('#'));

  const requiredSections = ['A) Cíl', 'B) Exit criteria', 'C) Změny', 'D) Ověření', 'E) Rizika/known limits', 'F) Handoff pro další prompt'];

  const missing = requiredSections.filter(
    (section) => !headingLines.some((line) => line.replace(/^#+\s*/, '').startsWith(section)),
  );

  if (missing.length > 0) {
    console.error(`Verification doc ${path} is missing required sections: ${missing.join(', ')}`);
    process.exit(1);
  }
};

const changed = getChangedFiles();
const changedPromptDirs = new Set(
  changed
    .map((path) => path.match(regenDirRegex)?.[1])
    .filter(Boolean),
);

for (const dirName of changedPromptDirs) {
  const verificationPath = `docs/regen/${dirName}/verification.md`;
  if (!changed.includes(verificationPath)) {
    console.error(`Changed prompt directory docs/regen/${dirName} must include ${verificationPath} in PR changes.`);
    process.exit(1);
  }

  assertRequiredSections(verificationPath);
}

const hasVerificationDoc = changed.some((path) => verificationRegex.test(path));
if (!hasVerificationDoc) {
  console.error('Missing docs/regen/<NN>-<slug>/verification.md in current PR changes.');
  process.exit(1);
}

console.log('Verification doc gate passed.');
