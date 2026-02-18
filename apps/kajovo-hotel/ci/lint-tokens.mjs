#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const root = resolve(process.cwd(), 'apps/kajovo-hotel');
const repoRoot = process.cwd();

const readJson = (relativePath) => {
  const content = readFileSync(resolve(root, relativePath), 'utf8');
  return JSON.parse(content);
};

const walk = (directory, acc = []) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') {
      continue;
    }
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, acc);
      continue;
    }
    acc.push(fullPath);
  }
  return acc;
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

const allowedCssValuePattern = /var\(--k-[\w-]+\)|\b0\b|\bnone\b|\bauto\b|\binherit\b|\binitial\b|\btransparent\b|\bcurrentColor\b/;
const lintRoots = [resolve(repoRoot, 'packages/ui/src'), resolve(repoRoot, 'apps/kajovo-hotel-web/src')];
const colorProperties = ['color', 'background', 'background-color', 'border-color', 'fill', 'stroke'];
const spacingProperties = [
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap', 'top', 'right', 'bottom', 'left', 'inset', 'inset-inline', 'inset-block'
];
const radiusProperties = ['border-radius'];
const shadowProperties = ['box-shadow', 'text-shadow'];
const zIndexProperties = ['z-index'];
const motionProperties = ['transition', 'transition-duration', 'animation', 'animation-duration'];

const cssPropertyGroups = [
  ...colorProperties,
  ...spacingProperties,
  ...radiusProperties,
  ...shadowProperties,
  ...zIndexProperties,
  ...motionProperties,
];

const cssRuleMatcher = new RegExp(`(${cssPropertyGroups.join('|')})\\s*:\\s*([^;]+);`, 'g');

const hasForbiddenCssLiteral = (property, value) => {
  const normalized = value.trim();

  if (allowedCssValuePattern.test(normalized)) {
    return false;
  }

  if (property === 'transition' || property === 'animation') {
    return /\d+(?:\.\d+)?m?s|ease|linear|cubic-bezier/.test(normalized);
  }

  if (property === 'box-shadow' || property === 'text-shadow') {
    return true;
  }

  if (colorProperties.includes(property)) {
    return /#|rgb\(|hsl\(/i.test(normalized) || !normalized.startsWith('var(');
  }

  return true;
};

for (const scopeRoot of lintRoots) {
  if (!statSync(scopeRoot, { throwIfNoEntry: false })?.isDirectory()) {
    continue;
  }

  for (const file of walk(scopeRoot)) {
    const extension = extname(file);
    if (!['.css', '.ts', '.tsx'].includes(extension)) {
      continue;
    }

    const source = readFileSync(file, 'utf8');
    const fileLabel = relative(repoRoot, file);

    if (extension === '.css') {
      let match;
      while ((match = cssRuleMatcher.exec(source)) !== null) {
        const [, property, rawValue] = match;
        if (!hasForbiddenCssLiteral(property, rawValue)) {
          continue;
        }
        errors.push(`token-only violation in ${fileLabel}: ${property}: ${rawValue.trim()}`);
      }
      continue;
    }

    const inlineStylePattern = /(style\s*=\s*\{\{[\s\S]*?\}\})/g;
    const styleBlocks = source.match(inlineStylePattern) ?? [];
    for (const block of styleBlocks) {
      if (/#|rgb\(|hsl\(|\b(?:margin|padding|gap|top|right|bottom|left|borderRadius|boxShadow|zIndex|transition|animation)\s*:\s*['"\d]/i.test(block)) {
        errors.push(`token-only inline style violation in ${fileLabel}: ${block.slice(0, 100)}...`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Token lint failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Token lint passed.');
