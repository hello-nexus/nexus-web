#!/usr/bin/env node
/**
 * Audit raw style declarations across all design-system axes.
 *
 *   npm run audit:styles                # report all axes, exit 0
 *   npm run audit:styles -- --strict    # exit non-zero on findings (CI gate)
 *   npm run audit:styles -- --axis=type # filter to a single axis
 *
 * Axes:
 *   type     - font / font-size / font-weight / line-height / letter-spacing
 *              (must come from `@include text-...` mixins in _text.scss)
 *   radius   - border-radius literal pixels (must use --radius-* tokens)
 *   shadow   - box-shadow with literal rgba (must use --shadow-* tokens)
 *   alpha    - rgba() / color-mix percentage literals (must use --alpha-* tokens)
 *   blur     - blur(<px>) outside known token values (must use --blur-* tokens)
 *   timing   - transition / animation duration literals (must use --ease-* tokens)
 *
 * Spacing and control-size axes intentionally NOT audited yet - they would
 * generate too many false positives without an extensive allowlist (every
 * `padding: 0.5rem` is technically drift but practically the right size).
 *
 * Exit 0 by default (advisory). Pass --strict to fail on findings - use this
 * once a surface is fully migrated to lock it down.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { TOKENED_TYPE_LINE } from './style-type-exceptions.mjs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const REPO_ROOT = new URL('../', import.meta.url).pathname;

// Files allowed to set raw values. Exact-match (not pattern-based) so renames
// are loud, not silent. Each path is relative to src/.
const ALLOWLIST = {
  type: new Set([
    'styles/_text.scss',
    'styles/variables.scss',
    'styles/global.scss',
  ]),
  radius: new Set([
    'styles/variables.scss',
    'styles/global.scss',  // raw HTML resets (input range thumb, etc)
  ]),
  shadow: new Set([
    'styles/variables.scss',
    'styles/global.scss',
  ]),
  alpha: new Set([
    'styles/variables.scss',
    'styles/global.scss',
    // Files where literal alphas are design-locked illustration content,
    // not theme drift:
    'components/HsvPicker/HsvPicker.module.scss',
    'components/PaletteRing/PaletteRing.module.scss',
    'components/ColorPickerWithPresets/ColorPickerWithPresets.module.scss',
    'panel/widgets/aquarium/AquariumWidget.module.scss',
    'panel/PanelOfflineOverlay.module.scss',
    'panel/PanelImmersiveOverlay.module.scss',
    'panel/styles/tokens.scss',
  ]),
  blur: new Set([
    'styles/variables.scss',
    'styles/global.scss',
    'panel/PanelOfflineOverlay.module.scss',
  ]),
  timing: new Set([
    'styles/variables.scss',
    'styles/global.scss',
    'components/HsvPicker/HsvPicker.module.scss', // hue-picker animations
  ]),
};

// Allowed token values per axis. Anything else flags.
const TYPE_PROPS = /^\s*(font|font-size|font-weight|line-height|letter-spacing)\s*:/;
const RADIUS_RAW = /\bborder-radius\s*:\s*([^;]+);/g;
const SHADOW_RAW = /\bbox-shadow\s*:\s*([^;]+);/g;
const ALPHA_RAW = /\brgba\s*\(/g; // any rgba() literal is suspect
const BLUR_RAW = /\bblur\s*\(\s*([0-9.]+)px\s*\)/g;
const TIMING_RAW = /(?:transition|animation)[^;]*?(\b(?:0\.[0-9]+s|[0-9]+ms)\b)/g;

// Per-axis line-level skip (comments, var declarations, etc.)
function isCommentOrVarDecl(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('*')) return true;
  if (trimmed.startsWith('/*')) return true;
  if (/^\s*--[\w-]+\s*:/.test(line)) return true;
  return false;
}

// Type axis: skip font-family / font-variant-numeric / inherit values, and
// single-declaration token lines (see style-type-exceptions.mjs).
function isTypeException(line) {
  const trimmed = line.trim();
  if (/^\s*font-family\s*:/.test(line)) return true;
  if (/^\s*font-variant-numeric\s*:/.test(line)) return true;
  if (/:\s*(inherit|unset|initial|revert|revert-layer)\s*[!;]?/.test(trimmed)) return true;
  if (TOKENED_TYPE_LINE.test(line)) return true;
  return false;
}

// Radius axis: skip values that are 0, 50%, inherit, or use --radius-* / --radius.
function isRadiusException(value) {
  const v = value.trim();
  if (v === '0' || v === '0px' || v === '50%' || v === 'inherit' || v === 'unset') return true;
  if (/var\(--radius/.test(v)) return true;
  // Also accept calc() expressions that themselves use --radius-* tokens
  if (/var\(--radius/.test(v)) return true;
  return false;
}

// Shadow axis: skip `none`, `inherit`, declarations using --shadow-* tokens,
// or simple `0 0 0 Npx <color>` ring shadows where the color is a token.
function isShadowException(value) {
  const v = value.trim();
  if (v === 'none' || v === 'inherit' || v === 'unset') return true;
  if (/var\(--shadow/.test(v)) return true;
  // Allow shadows whose color is a CSS token (e.g. var(--accent-glow-shadow)) -
  // those are legit since the dropoff alpha is owned by the accent system.
  // Block any shadow that contains rgba(/rgb( with literal numbers.
  if (/rgba?\(/.test(v)) return false; // explicitly catch literal colors
  return true; // anything without rgba is fine
}

function isBlurException(px) {
  // 8 (sm) and 20 (lg) are the canonical rungs.
  return px === '8' || px === '20';
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith('.scss')) {
      yield full;
    }
  }
}

function isAllowed(rel, axis) {
  return ALLOWLIST[axis]?.has(rel.split(sep).join('/')) ?? false;
}

const findings = {
  type: [],
  radius: [],
  shadow: [],
  alpha: [],
  blur: [],
  timing: [],
};

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const repoPath = relative(REPO_ROOT, file);

  // ── Line-based axis: type ──
  if (!isAllowed(rel, 'type')) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentOrVarDecl(line)) continue;
      if (isTypeException(line)) continue;
      if (TYPE_PROPS.test(line)) {
        findings.type.push({ file: repoPath, line: i + 1, decl: line.trim() });
      }
    }
  }

  // ── Block-level axes (radius / shadow / blur / timing / alpha) ──
  if (!isAllowed(rel, 'radius')) {
    for (const m of text.matchAll(RADIUS_RAW)) {
      if (!isRadiusException(m[1])) {
        const lineNum = text.slice(0, m.index).split('\n').length;
        findings.radius.push({ file: repoPath, line: lineNum, decl: m[0].trim() });
      }
    }
  }

  if (!isAllowed(rel, 'shadow')) {
    for (const m of text.matchAll(SHADOW_RAW)) {
      if (!isShadowException(m[1])) {
        const lineNum = text.slice(0, m.index).split('\n').length;
        findings.shadow.push({ file: repoPath, line: lineNum, decl: m[0].trim() });
      }
    }
  }

  if (!isAllowed(rel, 'blur')) {
    for (const m of text.matchAll(BLUR_RAW)) {
      if (!isBlurException(m[1])) {
        const lineNum = text.slice(0, m.index).split('\n').length;
        findings.blur.push({ file: repoPath, line: lineNum, decl: m[0].trim() });
      }
    }
  }

  if (!isAllowed(rel, 'timing')) {
    for (const m of text.matchAll(TIMING_RAW)) {
      const lineNum = text.slice(0, m.index).split('\n').length;
      findings.timing.push({ file: repoPath, line: lineNum, decl: m[1].trim() });
    }
  }

  if (!isAllowed(rel, 'alpha')) {
    for (const m of text.matchAll(ALPHA_RAW)) {
      const lineNum = text.slice(0, m.index).split('\n').length;
      findings.alpha.push({ file: repoPath, line: lineNum, decl: 'rgba()' });
    }
  }
}

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const axisFilter = args.find(a => a.startsWith('--axis='))?.slice(7);

const AXES = ['type', 'radius', 'shadow', 'alpha', 'blur', 'timing'];
const HEADERS = {
  type:    'TYPE     - raw font-size / weight / line-height / letter-spacing (use @include text-...)',
  radius:  'RADIUS   - raw border-radius literal (use --radius-* / --radius-pill / --radius-lg)',
  shadow:  'SHADOW   - raw box-shadow with literal rgba (use --shadow-sm / --shadow-md / --shadow-xl)',
  alpha:   'ALPHA    - raw rgba() literal (use --alpha-faint / --alpha-medium / --alpha-strong via rgb(R G B / var(...)))',
  blur:    'BLUR     - raw blur() outside 8/20 (use --blur-sm / --blur-lg)',
  timing:  'TIMING   - raw transition / animation duration (use --ease-fast / --ease / --ease-slow)',
};

let total = 0;
let any = false;
for (const axis of AXES) {
  if (axisFilter && axis !== axisFilter) continue;
  const list = findings[axis];
  if (list.length === 0) continue;
  any = true;
  total += list.length;
  console.log(`\n${HEADERS[axis]}  (${list.length} findings)`);
  const byFile = new Map();
  for (const f of list) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [file, items] of sorted.slice(0, 20)) {
    console.log(`  ${file}  (${items.length})`);
    for (const item of items.slice(0, 5)) {
      console.log(`    ${item.line.toString().padStart(4)}  ${item.decl}`);
    }
    if (items.length > 5) console.log(`    ${(items.length - 5)} more...`);
  }
  if (sorted.length > 20) console.log(`  ${sorted.length - 20} more files...`);
}

if (!any) {
  console.log('OK  All audited axes are clean.');
  process.exit(0);
}

console.log(`\n${total} total findings across ${AXES.filter(a => findings[a].length > 0).length} axes.`);
console.log('See Storybook > Foundation pages for the canonical menu of allowed values.');

if (strict) {
  console.error(`\nFAIL  Re-run without --strict for advisory mode.`);
  process.exit(1);
}

console.log('\nWARN  Migration in progress, not blocking the build.');
process.exit(0);
