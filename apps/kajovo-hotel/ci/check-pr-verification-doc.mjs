#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const verificationRegex = /^docs\/regen\/\d{2}[^/]*\/verification\.md$/;
const baseRef = process.env.GITHUB_BASE_REF;
const eventPath = process.env.GITHUB_EVENT_PATH;

if (!baseRef) {
  console.log('Verification doc gate is pull_request-only; skipping outside PR context.');
  process.exit(0);
}

const list = (cmd) => execSync(cmd, { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const unique = (paths) => [...new Set(paths.filter(Boolean))];

const readBaseShaFromEvent = () => {
  if (!eventPath) return null;
  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    return event?.pull_request?.base?.sha ?? null;
  } catch {
    return null;
  }
};

const changedFilesFromFallback = () => {
  const tracked = list('git diff --name-only HEAD');
  const untracked = list('git ls-files --others --exclude-standard');
  const headCommitFiles = list('git diff-tree --no-commit-id --name-only -r HEAD');
  return unique([...tracked, ...untracked, ...headCommitFiles]);
};

const filesFromBaseRef = () => {
  execSync(`git fetch origin ${baseRef} --depth=200`, { stdio: 'ignore' });
  return list(`git diff --name-only origin/${baseRef}...HEAD`);
};

const filesFromBaseSha = () => {
  const baseSha = readBaseShaFromEvent();
  if (!baseSha) {
    return [];
  }
  execSync(`git fetch origin ${baseSha} --depth=1`, { stdio: 'ignore' });
  return list(`git diff --name-only ${baseSha}..HEAD`);
};

const getChangedFiles = () => {
  try {
    return filesFromBaseRef();
  } catch (baseRefError) {
    try {
      const fromSha = filesFromBaseSha();
      if (fromSha.length > 0) {
        console.warn('Warning: unable to diff against origin base ref, used pull_request base SHA fallback.');
        return fromSha;
      }
    } catch {
      // continue to local fallback
    }

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
