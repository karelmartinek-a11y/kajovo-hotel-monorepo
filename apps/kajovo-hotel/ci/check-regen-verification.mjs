#!/usr/bin/env node
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const eventName = process.env.GITHUB_EVENT_NAME;
const baseSha = process.env.GITHUB_BASE_SHA;
const headSha = process.env.GITHUB_HEAD_SHA;

const run = (cmd) => execSync(cmd, { cwd: repoRoot, encoding: 'utf8' }).trim();

const listChangedFiles = () => {
  if (!baseSha || !headSha) {
    throw new Error('Missing GITHUB_BASE_SHA or GITHUB_HEAD_SHA');
  }
  return run(`git diff --name-only --diff-filter=ACMR ${baseSha}...${headSha}`).split('\n').filter(Boolean);
};

if (eventName !== 'pull_request') {
  console.log('PR verification check skipped: event is not pull_request.');
  process.exit(0);
}

let changedFiles = [];
try {
  changedFiles = listChangedFiles();
} catch (error) {
  console.error('Unable to compute changed files for PR verification check.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const verificationPattern = /^docs\/regen\/\d{2}[^/]*\/verification\.md$/;
const hasVerification = changedFiles.some((file) => verificationPattern.test(file));

if (!hasVerification) {
  console.error('Missing required docs/regen/<NN>-*/verification.md file in this PR.');
  process.exit(1);
}

console.log('PR verification check passed.');
