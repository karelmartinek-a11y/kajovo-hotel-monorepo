#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const errors = [];
const appSlug = 'kajovo-hotel';

const requiredManifest = resolve(repoRoot, 'ManifestDesignKájovo.md');
const forbiddenManifest = resolve(repoRoot, 'Manifest.md');

if (!existsSync(requiredManifest)) {
  errors.push('Missing ManifestDesignKájovo.md at repo root');
}
if (existsSync(forbiddenManifest)) {
  errors.push('Manifest.md must not exist (SSOT is ManifestDesignKájovo.md)');
}

const signaceDir = resolve(repoRoot, 'signace');
const signaceSvg = resolve(signaceDir, 'signace.svg');
const signacePdf = resolve(signaceDir, 'signace.pdf');
const signacePng = resolve(signaceDir, 'signace.png');

for (const file of [signaceSvg, signacePdf, signacePng]) {
  if (!existsSync(file)) {
    errors.push(`Missing required signace asset: ${file}`);
  }
}

const appLogoRoot = resolve(repoRoot, 'apps', appSlug, 'logo');
const masterSvg = resolve(appLogoRoot, 'sources', 'logo_master.svg');
if (!existsSync(masterSvg)) {
  errors.push('Missing apps/<app-slug>/logo/sources/logo_master.svg');
}

const brandJsonPath = resolve(repoRoot, 'apps', appSlug, 'brand', 'brand.json');
if (!existsSync(brandJsonPath)) {
  errors.push('Missing apps/<app-slug>/brand/brand.json');
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

let brandMeta = null;
if (existsSync(brandJsonPath)) {
  brandMeta = readJson(brandJsonPath);
  const requiredKeys = ['appSlug', 'appName', 'wordmarkLine2', 'usesLegacyOutlinePackV1', 'lockupH', 'gapG1', 'gapG2', 'safeZone', 'signaceViewBox'];
  for (const key of requiredKeys) {
    if (!(key in brandMeta)) {
      errors.push(`brand.json missing key: ${key}`);
    }
  }

  if (brandMeta?.appSlug !== appSlug) {
    errors.push(`brand.json appSlug must be ${appSlug}`);
  }

  if (typeof brandMeta?.usesLegacyOutlinePackV1 !== 'boolean') {
    errors.push('brand.json usesLegacyOutlinePackV1 must be boolean');
  }

  if (typeof brandMeta?.lockupH !== 'number' || brandMeta.lockupH <= 0) {
    errors.push('brand.json lockupH must be a positive number');
  }

  if (brandMeta?.gapG1 !== 10) {
    errors.push('brand.json gapG1 must be 10');
  }

  if (brandMeta?.gapG2 !== 30) {
    errors.push('brand.json gapG2 must be 30');
  }

  if (typeof brandMeta?.safeZone === 'number' && typeof brandMeta?.lockupH === 'number') {
    const expected = Number((brandMeta.lockupH * 0.1).toFixed(2));
    const actual = Number(brandMeta.safeZone.toFixed(2));
    if (Math.abs(actual - expected) > 0.5) {
      errors.push(`brand.json safeZone must be 0.10H (${expected})`);
    }
  }

  if (brandMeta?.signaceViewBox !== '0 0 59 202') {
    errors.push('brand.json signaceViewBox must be "0 0 59 202"');
  }
}

const exportRoot = resolve(appLogoRoot, 'exports');
const variants = ['full', 'mark', 'wordmark', 'signace'];
const pngSizes = [64, 128, 256, 512, 1024, 2048];

for (const variant of variants) {
  const svgPath = resolve(exportRoot, variant, 'svg', `${appSlug}_${variant}.svg`);
  const pdfPath = resolve(exportRoot, variant, 'pdf', `${appSlug}_${variant}.pdf`);
  const pngDir = resolve(exportRoot, variant, 'png');

  if (!existsSync(svgPath)) {
    errors.push(`Missing ${variant} SVG export: ${svgPath}`);
  }
  if (!existsSync(pdfPath)) {
    errors.push(`Missing ${variant} PDF export: ${pdfPath}`);
  }
  for (const size of pngSizes) {
    const pngPath = resolve(pngDir, `${appSlug}_${variant}_${size}.png`);
    if (!existsSync(pngPath)) {
      errors.push(`Missing ${variant} PNG export: ${pngPath}`);
    }
  }
}

const extractViewBox = (svgContent) => {
  const match = svgContent.match(/viewBox\s*=\s*"([^"]+)"/i);
  return match ? match[1].trim() : null;
};

const ensureSvgRules = (filePath, options = {}) => {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');

  if (/<text\b/i.test(content)) {
    errors.push(`SVG contains <text>: ${filePath}`);
  }

  if (/<(linearGradient|radialGradient|filter|mask|pattern|clipPath|fe[a-zA-Z]+)\b/i.test(content)) {
    errors.push(`SVG contains forbidden effects: ${filePath}`);
  }

  if (/<image\b/i.test(content) || /xlink:href\s*=\s*"http/i.test(content) || /href\s*=\s*"http/i.test(content)) {
    errors.push(`SVG contains external references: ${filePath}`);
  }

  const opacityRegex = /(opacity|fill-opacity|stroke-opacity)\s*=\s*"([^"]+)"/gi;
  let match;
  while ((match = opacityRegex.exec(content)) !== null) {
    const value = Number(match[2]);
    if (!Number.isNaN(value) && value < 1) {
      errors.push(`SVG contains opacity < 1 in ${filePath}`);
      break;
    }
  }

  if (/stroke\s*=\s*"(?!none|transparent)/i.test(content)) {
    errors.push(`SVG contains stroke definitions: ${filePath}`);
  }

  if (/#([0-9a-fA-F]{3})(?![0-9a-fA-F])/g.test(content)) {
    errors.push(`SVG contains short HEX colors: ${filePath}`);
  }

  const allowed = options.allowedColors ?? null;
  if (allowed) {
    const found = new Set();
    const hexRegex = /#([0-9a-fA-F]{6})/g;
    while ((match = hexRegex.exec(content)) !== null) {
      found.add(`#${match[1].toUpperCase()}`);
    }

    for (const color of found) {
      if (!allowed.has(color)) {
        errors.push(`SVG uses forbidden color ${color} in ${filePath}`);
      }
    }

    if (options.requiredColors) {
      for (const color of options.requiredColors) {
        if (!found.has(color)) {
          errors.push(`SVG missing required color ${color} in ${filePath}`);
        }
      }
    }
  }
};

const logoPalette = new Set(['#FF0000', '#FFFFFF', '#000000', '#737578', '#9AA0A6']);

ensureSvgRules(signaceSvg, {
  allowedColors: new Set(['#FF0000', '#FFFFFF']),
  requiredColors: ['#FF0000', '#FFFFFF'],
});

ensureSvgRules(masterSvg, { allowedColors: logoPalette });

ensureSvgRules(resolve(exportRoot, 'full', 'svg', `${appSlug}_full.svg`), { allowedColors: logoPalette });
ensureSvgRules(resolve(exportRoot, 'signace', 'svg', `${appSlug}_signace.svg`), {
  allowedColors: new Set(['#FF0000', '#FFFFFF']),
  requiredColors: ['#FF0000', '#FFFFFF'],
});
ensureSvgRules(resolve(exportRoot, 'wordmark', 'svg', `${appSlug}_wordmark.svg`), {
  allowedColors: new Set(['#000000', '#737578']),
  requiredColors: ['#000000', '#737578'],
});
ensureSvgRules(resolve(exportRoot, 'mark', 'svg', `${appSlug}_mark.svg`), {
  allowedColors: new Set(['#000000', '#737578', '#FF0000']),
  requiredColors: ['#000000', '#737578', '#FF0000'],
});

if (existsSync(signaceSvg) && brandMeta?.signaceViewBox) {
  const viewBox = extractViewBox(readFileSync(signaceSvg, 'utf8'));
  if (viewBox !== brandMeta.signaceViewBox) {
    errors.push(`signace.svg viewBox must be ${brandMeta.signaceViewBox}`);
  }
}

if (existsSync(masterSvg) && typeof brandMeta?.lockupH === 'number') {
  const masterViewBox = extractViewBox(readFileSync(masterSvg, 'utf8'));
  if (masterViewBox) {
    const parts = masterViewBox.split(/\s+/).map((value) => Number(value));
    if (parts.length === 4) {
      const height = parts[3];
      const expectedHeight = brandMeta.lockupH * 1.2;
      if (Math.abs(height - expectedHeight) > 1) {
        errors.push(`logo_master.svg viewBox height must be ~${expectedHeight.toFixed(2)}`);
      }
    }
  }
}

const uxDir = resolve(repoRoot, 'apps', appSlug, 'ux');
const iaPath = resolve(uxDir, 'ia.json');
const voicePath = resolve(uxDir, 'voice.json');
const contentPath = resolve(uxDir, 'content.json');
const donePath = resolve(uxDir, 'done.json');

for (const file of [iaPath, voicePath, contentPath, donePath]) {
  if (!existsSync(file)) {
    errors.push(`Missing UX file: ${file}`);
  }
}

const requiredStates = ['loading', 'empty', 'error', 'offline', 'maintenance', '404'];

if (existsSync(iaPath)) {
  const ia = readJson(iaPath);
  const views = ia.views ?? [];
  if (!Array.isArray(views) || views.length === 0) {
    errors.push('ux/ia.json must define views');
  }
  for (const view of views) {
    const states = view.states ?? [];
    for (const required of requiredStates) {
      if (!states.includes(required)) {
        errors.push(`ux/ia.json view ${view.route ?? view.key ?? view.id} missing state ${required}`);
      }
    }
    const responsive = view.responsive ?? view.responsiveness ?? null;
    if (Array.isArray(responsive)) {
      for (const breakpoint of ['phone', 'tablet', 'desktop']) {
        if (!responsive.includes(breakpoint)) {
          errors.push(`ux/ia.json view ${view.route ?? view.key ?? view.id} missing responsive ${breakpoint}`);
        }
      }
    }
  }
}

if (existsSync(donePath)) {
  const done = readJson(donePath);
  const def = done.definitionOfDone ?? {};
  for (const required of requiredStates) {
    if (!def.requiredStates?.includes(required)) {
      errors.push(`ux/done.json requiredStates missing ${required}`);
    }
  }
  const requiredBreakpoints = ['phone', 'tablet', 'desktop'];
  for (const breakpoint of requiredBreakpoints) {
    if (!def.requiredResponsiveBreakpoints?.includes(breakpoint)) {
      errors.push(`ux/done.json requiredResponsiveBreakpoints missing ${breakpoint}`);
    }
  }
  for (const view of done.views ?? []) {
    const states = view.states ?? [];
    for (const required of requiredStates) {
      if (!states.includes(required)) {
        errors.push(`ux/done.json view ${view.id ?? view.route} missing state ${required}`);
      }
    }
  }
}

if (existsSync(voicePath)) {
  const voice = readFileSync(voicePath, 'utf8');
  if (/Manifest\.md/.test(voice)) {
    errors.push('ux/voice.json must reference ManifestDesignKájovo.md (not Manifest.md)');
  }
  if (!/ManifestDesignKájovo\.md/.test(voice)) {
    errors.push('ux/voice.json must reference ManifestDesignKájovo.md');
  }
}

const placeholderPattern = /(lorem|placeholder|tbd|todo|mvp)/i;
if (existsSync(contentPath)) {
  const contentRaw = readFileSync(contentPath, 'utf8');
  if (placeholderPattern.test(contentRaw)) {
    errors.push('ux/content.json contains placeholder text');
  }
}

if (errors.length > 0) {
  console.error('Brand asset lint failed:');
  for (const error of errors) {
    console.error(` - ${error}`);
  }
  process.exit(1);
}

console.log('Brand asset lint passed.');
