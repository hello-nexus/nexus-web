#!/usr/bin/env node
/**
 * Diff CSS-module class hashes referenced in JS bundles vs hashes that
 * actually appear in CSS bundles. The classic Vite footgun: a module's
 * compiled .module.scss can land in a lazy CSS chunk while the eager
 * importer only loads the main CSS, leaving the consumer styled by the
 * cascade defaults instead of the module rules.
 *
 * Usage:
 *   npm run build:service   (or npm run build)
 *   node scripts/audit-css-chunks.mjs
 *
 * Prints any CSS-module class hash referenced in `index-*.js` (the main
 * eager bundle) but not present in `index-*.css`. Exits 0 either way -
 * this is a diagnostic, not a build gate. The Slider/data-fill bug that
 * motivated this script (where the panel's eager Slider rendered
 * unstyled because Vite attributed Slider.module.scss to the station
 * lazy chunk) was caught by exactly this diff.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST_ASSETS = new URL('../dist/assets/', import.meta.url).pathname;

const files = readdirSync(DIST_ASSETS);
const indexJs = files.find(f => /^index-.*\.js$/.test(f));
const indexCss = files.find(f => /^index-.*\.css$/.test(f));
if (!indexJs || !indexCss) {
  console.error('Expected dist/assets/index-*.js and index-*.css. Did you run a build?');
  process.exit(2);
}

const otherCssFiles = files.filter(f => f.endsWith('.css') && f !== indexCss);

const indexJsContent = readFileSync(join(DIST_ASSETS, indexJs), 'utf8');
const indexCssContent = readFileSync(join(DIST_ASSETS, indexCss), 'utf8');

// Module class hashes look like _name_HASH_LINE where HASH is 5 chars
// alphanumeric and LINE is the source line. The pattern catches Vite's
// CSS-modules naming convention; non-module global classes are excluded
// because they don't have the trailing _digit suffix.
const HASH_RE = /\b_[a-zA-Z][a-zA-Z0-9]*_[a-z0-9]{5}_\d+\b/g;

const inJs = new Set(indexJsContent.match(HASH_RE) ?? []);
const inMainCss = new Set(indexCssContent.match(HASH_RE) ?? []);

const missing = [...inJs].filter(name => !inMainCss.has(name)).sort();

if (missing.length === 0) {
  console.log(`OK: every CSS-module class referenced from ${indexJs} is present in ${indexCss}.`);
  console.log(`(scanned ${inJs.size} unique class hashes in JS, ${inMainCss.size} in CSS)`);
  process.exit(0);
}

const missingMap = new Map();
for (const name of missing) {
  let foundIn = null;
  for (const file of otherCssFiles) {
    const content = readFileSync(join(DIST_ASSETS, file), 'utf8');
    if (content.includes(name)) {
      foundIn = file;
      break;
    }
  }
  missingMap.set(name, foundIn ?? '(not found in any chunk)');
}

const byChunk = new Map();
for (const [name, chunk] of missingMap) {
  if (!byChunk.has(chunk)) byChunk.set(chunk, []);
  byChunk.get(chunk).push(name);
}

console.log(`Found ${missing.length} CSS-module classes referenced in ${indexJs} but missing from ${indexCss}.`);
console.log('Each class is grouped by which chunk currently owns its CSS:\n');
for (const [chunk, names] of [...byChunk.entries()].sort()) {
  console.log(`-- ${chunk} (${names.length}) --`);
  for (const n of names.slice(0, 8)) console.log(`   ${n}`);
  if (names.length > 8) console.log(`   ... +${names.length - 8} more`);
  console.log('');
}

console.log('Fix options:');
console.log('  1. Move the rule to src/styles/global.scss with a unique selector (works for trackFill-style overrides on shared elements).');
console.log('  2. Force the SCSS module into the main bundle by adding a side-effect import in main.tsx or a top-level eager file.');
console.log('  3. If the class is genuinely only used in the lazy chunk, this is a false positive - the JS reference might be from an eager error path or unused branch.');
