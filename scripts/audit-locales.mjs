#!/usr/bin/env node
/**
 * Diff every locale's key set against en.json. Reports any locale that
 * is missing keys present in English (silent fallthrough to English at
 * runtime would make the bug invisible) or that has keys not in
 * English (likely a typo or removed key).
 *
 * A locale whose CLDR cardinal-plural rule has more categories than
 * English's own one/other (Polish and Russian both add "few") may carry a
 * `.few` sibling of an existing `.one`/`.other` pair - not drift, since
 * pluralKey.ts falls back to `.other` for every locale that has no such
 * key. Only a `.few` key whose `.other` sibling exists in English passes;
 * an orphaned `.few` with no such sibling is still reported.
 *
 * Exits non-zero if any locale drifts. Run as part of CI to enforce
 * parity:
 *   node scripts/audit-locales.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES_DIR = new URL('../src/locales/', import.meta.url).pathname;

const files = readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json'));
const enFile = files.find(f => f === 'en.json');
if (!enFile) {
  console.error('en.json not found in src/locales/');
  process.exit(2);
}

const en = JSON.parse(readFileSync(join(LOCALES_DIR, enFile), 'utf8'));
const enKeys = new Set(Object.keys(en));

function isPluralCategoryExtension(key) {
  return key.endsWith('.few') && enKeys.has(`${key.slice(0, -'.few'.length)}.other`);
}

let drift = 0;

for (const file of files.sort()) {
  if (file === 'en.json') continue;
  const data = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'));
  const keys = new Set(Object.keys(data));
  const missing = [...enKeys].filter(k => !keys.has(k));
  const extra = [...keys].filter(k => !enKeys.has(k) && !isPluralCategoryExtension(k));
  if (missing.length === 0 && extra.length === 0) {
    console.log(`OK  ${file}`);
    continue;
  }
  drift += 1;
  console.log(`DRIFT ${file}`);
  if (missing.length) console.log(`  missing ${missing.length}: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '...' : ''}`);
  if (extra.length) console.log(`  extra ${extra.length}: ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? '...' : ''}`);
}

if (drift === 0) {
  console.log(`\nLocale parity OK across ${files.length} files (${enKeys.size} keys each).`);
  process.exit(0);
}
console.log(`\n${drift} locale file(s) drifted from en.json.`);
process.exit(1);
