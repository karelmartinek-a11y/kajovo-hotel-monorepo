#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ia = JSON.parse(
  readFileSync(resolve(process.cwd(), 'apps/kajovo-hotel/ux/ia.json'), 'utf8')
);

const errors = [];
const signage = ia.brandPolicy?.signage;

if (!signage) {
  errors.push('brandPolicy.signage is missing');
} else {
  if (signage.text !== 'KÁJOVO') errors.push('brandPolicy.signage.text must be KÁJOVO');
  if (signage.background !== '#FF0000') errors.push('brandPolicy.signage.background must be #FF0000');
  if (signage.textColor !== '#FFFFFF') errors.push('brandPolicy.signage.textColor must be #FFFFFF');
  if (signage.position !== 'fixed-left-bottom') errors.push('brandPolicy.signage.position must be fixed-left-bottom');
  if (signage.alwaysVisibleOnScroll !== true) errors.push('brandPolicy.signage.alwaysVisibleOnScroll must be true');
}

if (ia.brandPolicy?.maxBrandElementsPerView !== 2) {
  errors.push('brandPolicy.maxBrandElementsPerView must be 2');
}

for (const view of ia.views ?? []) {
  if (view.signageRequired !== true) {
    errors.push(`view ${view.key} must declare signageRequired=true (outside PopUp)`);
  }
  if (view.maxBrandElements > 2) {
    errors.push(`view ${view.key} exceeds max brand elements (2)`);
  }
}

if (errors.length > 0) {
  console.error('Signage scaffold failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Signage scaffold passed.');
