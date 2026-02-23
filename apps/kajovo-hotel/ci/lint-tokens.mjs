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

const ssotFile = 'ManifestDesignKájovo.md';

const normalizeHex = (value) => (typeof value === 'string' ? value.toUpperCase() : value);
const expectHex = (actual, expected, label) => {
  if (normalizeHex(actual) !== expected) {
    errors.push(`${label} must be ${expected}`);
  }
};

const requiredSignage = {
  text: 'KÁJOVO',
  bg: '#FF0000',
  fg: '#FFFFFF',
  position: 'fixed-left-bottom'
};

if (tokens.meta?.ssot !== ssotFile) {
  errors.push(`ui-tokens.meta.ssot must be ${ssotFile}`);
}
if (palette.meta?.ssot !== ssotFile) {
  errors.push(`palette.meta.ssot must be ${ssotFile}`);
}
if (motion.meta?.ssot !== ssotFile) {
  errors.push(`ui-motion.meta.ssot must be ${ssotFile}`);
}

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
if (typeof tokens.signage?.minThicknessPx !== 'number' || tokens.signage.minThicknessPx < 24) {
  errors.push('signage.minThicknessPx must be at least 24');
}

expectHex(palette.brand?.red, requiredSignage.bg, 'palette.brand.red');
expectHex(palette.brand?.white, requiredSignage.fg, 'palette.brand.white');
expectHex(palette.brand?.ink, '#000000', 'palette.brand.ink');
expectHex(palette.brand?.metal, '#737578', 'palette.brand.metal');
expectHex(palette.brand?.subtleMetal, '#9AA0A6', 'palette.brand.subtleMetal');

expectHex(palette.neutral?.ink900, '#111111', 'palette.neutral.ink900');
expectHex(palette.neutral?.ink700, '#333333', 'palette.neutral.ink700');
expectHex(palette.neutral?.ink500, '#666666', 'palette.neutral.ink500');
expectHex(palette.neutral?.line300, '#E0E0E0', 'palette.neutral.line300');
expectHex(palette.neutral?.surface100, '#FFFFFF', 'palette.neutral.surface100');
expectHex(palette.neutral?.surface200, '#F5F5F5', 'palette.neutral.surface200');
expectHex(palette.neutral?.surface300, '#EEEEEE', 'palette.neutral.surface300');

expectHex(palette.state?.success, '#1B5E20', 'palette.state.success');
expectHex(palette.state?.warning, '#E65100', 'palette.state.warning');
expectHex(palette.state?.error, '#B71C1C', 'palette.state.error');
expectHex(palette.state?.info, '#0D47A1', 'palette.state.info');

if (!motion?.reducedMotion?.respectPrefersReducedMotion) {
  errors.push('motion.reducedMotion.respectPrefersReducedMotion must be true');
}

const expectedBreakpoints = {
  sm: { min: 0, max: 599 },
  md: { min: 600, max: 1023 },
  lg: { min: 1024, max: 1439 },
  xl: { min: 1440, max: 99999 },
};

for (const [key, expected] of Object.entries(expectedBreakpoints)) {
  const actual = tokens.breakpoints?.[key];
  if (!actual || actual.min !== expected.min || actual.max !== expected.max) {
    errors.push(`breakpoints.${key} must be ${expected.min}-${expected.max}`);
  }
}

const expectedDeviceClasses = {
  phone: { min: 360, max: 480 },
  tablet: { min: 768, max: 1024 },
  desktop: { min: 1280, max: 1920 },
};

for (const [key, expected] of Object.entries(expectedDeviceClasses)) {
  const actual = tokens.device_classes?.[key];
  if (!actual || actual.min !== expected.min || actual.max !== expected.max) {
    errors.push(`device_classes.${key} must be ${expected.min}-${expected.max}`);
  }
}

const typography = tokens.typography ?? {};
if (!String(typography.fontFamily ?? '').includes('Montserrat')) {
  errors.push('typography.fontFamily must include Montserrat');
}
if (typography.weights?.regular !== 400 || typography.weights?.bold !== 700) {
  errors.push('typography.weights must be regular=400 and bold=700');
}

const expectedSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
};

for (const [key, value] of Object.entries(expectedSizes)) {
  if (typography.sizes?.[key] !== value) {
    errors.push(`typography.sizes.${key} must be ${value}`);
  }
}

const expectedLineHeights = {
  h1: 40,
  h2: 32,
  h3: 28,
  body: 24,
  sm: 20,
  xs: 16,
};

for (const [key, value] of Object.entries(expectedLineHeights)) {
  if (typography.lineHeights?.[key] !== value) {
    errors.push(`typography.lineHeights.${key} must be ${value}`);
  }
}

if (typography.letterSpacing?.caps !== '0.08em') {
  errors.push('typography.letterSpacing.caps must be 0.08em');
}

const expectedRadius = { r0: 0, r8: 8, r12: 12, r16: 16 };
for (const [key, value] of Object.entries(expectedRadius)) {
  if (tokens.radius?.[key] !== value) {
    errors.push(`radius.${key} must be ${value}`);
  }
}

const hitTarget = tokens.hit_target ?? {};
if (hitTarget.touch?.minWidth !== 44 || hitTarget.touch?.minHeight !== 44) {
  errors.push('hit_target.touch must be 44x44');
}
if (hitTarget.desktop?.minWidth !== 36 || hitTarget.desktop?.minHeight !== 36) {
  errors.push('hit_target.desktop must be 36x36');
}

const componentStates = tokens.componentStates ?? {};
if (componentStates.focusRingWidth !== 2) {
  errors.push('componentStates.focusRingWidth must be 2');
}

for (const [key, value] of Object.entries(tokens.spacing ?? {})) {
  if (typeof value !== 'number' || value % 4 !== 0) {
    errors.push(`spacing.${key} must be multiple of 4`);
  }
}

const durations = motion.durationsMs ?? {};
const inRange = (value, min, max) => typeof value === 'number' && value >= min && value <= max;

if (durations.instant !== 0) {
  errors.push('motion.durationsMs.instant must be 0');
}
if (!inRange(durations.fast, 120, 180)) {
  errors.push('motion.durationsMs.fast must be 120-180');
}
if (!inRange(durations.normal, 180, 260)) {
  errors.push('motion.durationsMs.normal must be 180-260');
}
if (!inRange(durations.slow, 180, 260)) {
  errors.push('motion.durationsMs.slow must be 180-260');
}
if (!inRange(durations.toast, 160, 260)) {
  errors.push('motion.durationsMs.toast must be 160-260');
}

const allowedCssValuePattern = /var\(--k-[\w-]+\)|\b0\b|\bnone\b|\bauto\b|\binherit\b|\binitial\b|\btransparent\b|\bcurrentColor\b/;
const lintRoots = [
  resolve(repoRoot, 'packages/ui/src'),
  resolve(repoRoot, 'apps/kajovo-hotel-web/src'),
  resolve(repoRoot, 'apps/kajovo-hotel-admin/src'),
];
const hardcodedColorWhitelistPrefixes = ['brand/'];
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
    const hasLiteralColor = /#|rgb\(|hsl\(/i.test(normalized);
    if (hasLiteralColor) {
      return true;
    }
    if (/linear-gradient|radial-gradient/i.test(normalized)) {
      return !/var\(--k-[\w-]+\)/.test(normalized);
    }
    return !normalized.startsWith('var(');
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
    const fileLabel = relative(repoRoot, file).replaceAll('\\', '/');
    if (hardcodedColorWhitelistPrefixes.some((prefix) => fileLabel.startsWith(prefix))) {
      continue;
    }

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
