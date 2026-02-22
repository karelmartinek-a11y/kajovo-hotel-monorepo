#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const parityMapPath = 'docs/regen/parity/parity-map.yaml';
const parityMap = readFileSync(parityMapPath, 'utf8');

const placeholderRegex = /\bthis-pr(?:-[\w-]+)?\b/g;
const matches = [...parityMap.matchAll(placeholderRegex)];

if (matches.length > 0) {
  const uniqueMatches = [...new Set(matches.map((match) => match[0]))];
  console.error(`Parity map contains forbidden placeholder references: ${uniqueMatches.join(', ')}`);
  console.error(`Replace placeholder entries in ${parityMapPath} with concrete links or remove them.`);
  process.exit(1);
}

console.log('Parity map placeholder gate passed.');
