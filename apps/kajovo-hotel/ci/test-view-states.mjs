#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ia = JSON.parse(
  readFileSync(resolve(process.cwd(), 'apps/kajovo-hotel/ux/ia.json'), 'utf8')
);

const requiredStates = ['loading', 'empty', 'error', 'offline', 'maintenance', '404'];
const requiredResponsive = ['phone', 'tablet', 'desktop'];
const errors = [];

for (const state of requiredStates) {
  if (!(ia.viewStatePolicy?.requiredStates ?? []).includes(state)) {
    errors.push(`viewStatePolicy.requiredStates missing ${state}`);
  }
}

for (const layout of requiredResponsive) {
  if (!(ia.viewStatePolicy?.requiredResponsiveLayouts ?? []).includes(layout)) {
    errors.push(`viewStatePolicy.requiredResponsiveLayouts missing ${layout}`);
  }
}

for (const view of ia.views ?? []) {
  const states = view.states ?? [];
  const responsive = view.responsive ?? [];

  for (const state of requiredStates) {
    if (!states.includes(state)) errors.push(`view ${view.key} missing state ${state}`);
  }

  for (const layout of requiredResponsive) {
    if (!responsive.includes(layout)) errors.push(`view ${view.key} missing responsive layout ${layout}`);
  }
}

if (errors.length > 0) {
  console.error('View-state scaffold failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('View-state scaffold passed.');
