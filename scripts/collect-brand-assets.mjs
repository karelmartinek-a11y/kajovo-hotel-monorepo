#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const appPathArg = process.argv[2];

if (!appPathArg) {
  console.error('Usage: node scripts/collect-brand-assets.mjs <app-path>');
  process.exit(1);
}

const repoRoot = process.cwd();
const appRoot = resolve(repoRoot, appPathArg);
const appPublicBrandRoot = resolve(appRoot, 'public', 'brand');

const canonicalLogoExports = resolve(repoRoot, 'apps', 'kajovo-hotel', 'logo', 'exports');
const canonicalSignaceSvg = resolve(canonicalLogoExports, 'signace', 'svg', 'kajovo-hotel_signace.svg');

if (!existsSync(canonicalLogoExports)) {
  console.error(`Missing canonical logo exports: ${canonicalLogoExports}`);
  process.exit(1);
}

if (!existsSync(canonicalSignaceSvg)) {
  console.error(`Missing canonical signace SVG: ${canonicalSignaceSvg}`);
  process.exit(1);
}

mkdirSync(appPublicBrandRoot, { recursive: true });

const logoExportsTarget = resolve(appPublicBrandRoot, 'logo', 'exports');
mkdirSync(dirname(logoExportsTarget), { recursive: true });
cpSync(canonicalLogoExports, logoExportsTarget, { recursive: true, force: true });

const signaceTargetDir = resolve(appPublicBrandRoot, 'signace');
mkdirSync(signaceTargetDir, { recursive: true });
cpSync(canonicalSignaceSvg, resolve(signaceTargetDir, 'signace.svg'), { force: true });

console.log(`Collected brand assets for ${appPathArg}`);
