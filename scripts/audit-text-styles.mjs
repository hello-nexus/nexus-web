#!/usr/bin/env node
/**
 * Audit raw type declarations in component styles. The canonical text system
 * (src/styles/_text.scss) provides 7 mixins that bundle font-size, weight,
 * line-height, and letter-spacing. Component styles must reach for one of
 * those mixins via `@include text-...` instead of hand-rolling the four
 * properties. This script reports every place that doesn't.
 *
 *   npm run audit:text-styles           # report and exit 0 (CI-friendly warning)
 *   npm run audit:text-styles -- --strict   # exit non-zero on findings
 *
 * Exit 0 by default (warnings only - we don't break the build during the
 * gradual migration to the mixin system). Pass --strict to gate CI once the
 * codebase is fully migrated.
 *
 * The canonical files (the mixin source, the design tokens, and global
 * resets that target raw HTML elements) are exempt - listed in ALLOWLIST.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { TOKENED_TYPE_LINE } from './style-type-exceptions.mjs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const REPO_ROOT = new URL('../', import.meta.url).pathname;

// Files allowed to set raw type properties. The list is intentionally
// exact-match (not pattern-based) so renames are loud, not silent.
//   _text.scss        - canonical mixin source
//   variables.scss    - design tokens (declares --type-*, --weight-* primitives)
//   global.scss       - resets / base styles for raw <input>, <button>, etc.,
//                       plus the legacy %chip-base placeholder (carries
//                       migration debt: those rules will move to text-button
//                       in a follow-up; until then keep this exempted)
const ALLOWLIST = new Set([
  'styles/_text.scss',
  'styles/variables.scss',
  'styles/global.scss',
]);

// Properties that must come from a text mixin in component styles.
//   font: shorthand   - covers size + weight + line-height in one go
//   font-size         - direct
//   font-weight       - direct
//   line-height       - direct
//   letter-spacing    - direct
//
// The match is line-based and anchored at the start of a line (after leading
// whitespace). Multi-line `font:` shorthand and inline-block declarations
// (`.foo { font-size: X; }`) are not caught. Acceptable: the codebase uses
// neither pattern. If those gaps start mattering, switch to a real SCSS AST
// (e.g. postcss + postcss-scss) instead of growing the regex.
const RAW_TYPE = /^\s*(font|font-size|font-weight|line-height|letter-spacing)\s*:/;

// Lines to ignore even inside non-allowlisted files:
//   - comments (// ...) and SCSS block comments
//   - CSS variable declarations (--font-mono: ...)
//   - font-family declarations (still allowed; only the 4 metrics above are gated)
//   - font-variant-numeric (legitimate composition tweak, e.g. tabular-nums)
//   - inherit / unset / initial (legitimate composition, not a raw value pick)
//   - single-declaration var(--type-*) / var(--weight-*) lines (sanctioned
//     central-scale values; see style-type-exceptions.mjs)
function isException(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('*')) return true;
  if (trimmed.startsWith('/*')) return true;
  if (/^\s*--[\w-]+\s*:/.test(line)) return true;
  if (/^\s*font-family\s*:/.test(line)) return true;
  if (/^\s*font-variant-numeric\s*:/.test(line)) return true;
  if (/:\s*(inherit|unset|initial|revert|revert-layer)\s*[!;]?/.test(trimmed)) return true;
  if (TOKENED_TYPE_LINE.test(line)) return true;
  return false;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith('.scss') || entry.endsWith('.module.scss')) {
      yield full;
    }
  }
}

function isAllowed(relPath) {
  // Normalize Windows-style separators just in case.
  const normalized = relPath.split(sep).join('/');
  return ALLOWLIST.has(normalized);
}

const findings = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (isAllowed(rel)) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isException(line)) continue;
    if (!RAW_TYPE.test(line)) continue;
    findings.push({
      file: relative(REPO_ROOT, file),
      line: i + 1,
      decl: line.trim(),
    });
  }
}

const strict = process.argv.includes('--strict');

if (findings.length === 0) {
  console.log('OK  No raw type declarations outside the canonical files.');
  process.exit(0);
}

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

const sortedFiles = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);

console.log(`Found ${findings.length} raw type declaration(s) in ${byFile.size} file(s).`);
console.log('Each one should be replaced by `@include text-<style>;` from src/styles/_text.scss.');
console.log('See Storybook > Foundation > Text styles for the canonical 7-style spec.');
console.log('');

for (const [file, items] of sortedFiles) {
  console.log(`${file}  (${items.length})`);
  for (const item of items) {
    console.log(`  ${item.line.toString().padStart(4)}  ${item.decl}`);
  }
  console.log('');
}

if (strict) {
  console.error(`FAIL  ${findings.length} raw declarations found. Re-run without --strict for advisory mode.`);
  process.exit(1);
}

// No process.exit() after the listing: stdout to a pipe is async on Linux, and
// process.exit() drops the unflushed buffer mid-write — truncating this summary
// line, which callers (the drift-ratchet test) parse. Exit naturally so it flushes.
console.log(`WARN  ${findings.length} raw declarations - migration in progress, not blocking the build.`);
