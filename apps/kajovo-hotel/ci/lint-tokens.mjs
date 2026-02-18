#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'apps/kajovo-hotel');

const readJson = (relativePath) => {
  const content = readFileSync(resolve(root, relativePath), 'utf8');
  return JSON.parse(content);
};

const errors = [];

const tokens = readJson('ui-tokens/tokens.json');
const palette = readJson('palette/palette.json');
const motion = readJson('ui-motion/motion.json');

const requiredSignage = {
  text: 'KÁJOVO',
  bg: '#FF0000',
  fg: '#FFFFFF',
  position: 'fixed-left-bottom'
};

if (tokens.signage?.text !== requiredSignage.text) {
  errors.push(`signage.text must be ${requiredSignage.text}`);
}
if (tokens.signage?.colors?.background !== requiredSignage.bg) {
  errors.push(`signage.colors.background must be ${requiredSignage.bg}`);
}
if (tokens.signage?.colors?.text !== requiredSignage.fg) {
  errors.push(`signage.colors.text must be ${requiredSignage.fg}`);
}
if (tokens.signage?.position !== requiredSignage.position) {
  errors.push(`signage.position must be ${requiredSignage.position}`);
}
if (tokens.signage?.alwaysVisibleOnScroll !== true) {
  errors.push('signage.alwaysVisibleOnScroll must be true');
}

if (palette.brand?.red !== requiredSignage.bg || palette.brand?.white !== requiredSignage.fg) {
  errors.push('palette brand red/white must remain #FF0000/#FFFFFF for SIGNACE');
}

if (!motion?.reducedMotion?.respectPrefersReducedMotion) {
  errors.push('motion.reducedMotion.respectPrefersReducedMotion must be true');
}

if (errors.length > 0) {
  console.error('Token lint failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Token lint passed.');
