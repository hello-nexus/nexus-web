// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The Q60 panel runs a Chromium 83 WebView (the workspace's documented CSS
// floor). Styles that can render there must not use features 83 lacks:
//  - `gap` on a FLEX container (Chromium 84; grid gap is fine) - use the
//    hgap/vgap/wrapgap mixins from src/panel/styles/_flexGap.scss instead
//  - the `inset:` shorthand (Chromium 87) - write the longhands
//  - `aspect-ratio` (Chromium 88) - explicit sizes, a padding-ratio box, or
//    an 83-safe base with the exact modern box restored under
//    `@supports (aspect-ratio: 1)`
// A declaration inside an @supports (aspect-ratio) block is exempt (83 skips
// the whole block), as is any declaration carrying a `/* c83:allow */` marker.

const ROOT = join(__dirname);
// Panel-runtime style roots: the shell, its chrome/overlay layers, and every
// widget family mountable on the q60 single-widget surface (2x4, non-touch)
// plus the shared chrome.
const RUNTIME_DIRS = [
  '.', 'chrome', 'overlays',
  'widgets/calendar', 'widgets/clock', 'widgets/gallery', 'widgets/media', 'widgets/monitoring',
  'widgets/screentime', 'widgets/stocks', 'widgets/twitch', 'widgets/weather',
];
const RUNTIME_FILES = [
  'widgets/common/PanelWidgetChrome.module.scss',
  'widgets/common/PanelMixerSlider.module.scss',
  'widgets/common/FitLine.module.scss',
];
// Editor-only surfaces (rendered in the app or on touch panels, never on q60).
const EXCLUDE = /Settings|Page\.|Touch|Modal|Search|Immersive|Editor|Picker|EditSheet|ContextMenu|WorldClockMap|ClockWorldView|[\\/]page[\\/]/;

function scssFilesIn(dir: string): string[] {
  const abs = join(ROOT, dir);
  let entries: string[];
  try { entries = readdirSync(abs); } catch { return []; }
  return entries.flatMap((name) => {
    const rel = join(dir, name);
    const p = join(abs, name);
    if (statSync(p).isDirectory()) return dir === '.' || dir === 'chrome' || dir === 'overlays' ? [] : scssFilesIn(rel);
    return name.endsWith('.scss') && !EXCLUDE.test(rel) ? [p] : [];
  });
}

interface Offence { file: string; line: number; text: string }

// Character-walking declaration scanner: tracks the block stack (so a
// declaration is attributed to the block its braces actually enclose, even
// with several declarations or a brace on one line), whether each block
// declares display: grid/inline-grid, and whether it sits under an
// @supports (aspect-ratio ...) at-rule.
function scan(): Offence[] {
  const files = [
    ...RUNTIME_DIRS.flatMap(scssFilesIn),
    ...RUNTIME_FILES.map((f) => join(ROOT, f)),
  ];
  expect(files.length).toBeGreaterThan(35); // the glob went stale if this trips
  const offences: Offence[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    interface Block { decls: { text: string; line: number; allow?: boolean }[]; grid: boolean; supportsAr: boolean; header: string }
    const stack: Block[] = [{ decls: [], grid: false, supportsAr: false, header: '' }];
    const flush = (b: Block) => {
      for (const d of b.decls) {
        if (d.allow) continue;
        const gap = /^(row-|column-)?gap:/.test(d.text);
        const inset = /^inset:/.test(d.text);
        const ar = /^aspect-ratio:/.test(d.text);
        const exempt = b.supportsAr || (gap && b.grid);
        if ((gap || inset || ar) && !exempt) {
          offences.push({ file: file.replace(ROOT, 'src/panel'), line: d.line, text: d.text });
        }
      }
    };
    let buf = '';
    let comment = '';
    let allowNext = false;
    let line = 1;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\n') { line++; inLineComment = false; }
      if (inLineComment) continue;
      if (inBlockComment) {
        comment += ch;
        if (ch === '/' && src[i - 1] === '*') {
          inBlockComment = false;
          if (comment.includes('c83:allow')) allowNext = true;
          comment = '';
        }
        continue;
      }
      if (ch === '/' && src[i + 1] === '/') { inLineComment = true; continue; }
      if (ch === '/' && src[i + 1] === '*') { inBlockComment = true; continue; }
      if (ch === '{') {
        const header = buf.trim();
        const parent = stack[stack.length - 1];
        stack.push({
          decls: [], grid: false, header,
          supportsAr: parent.supportsAr || /@supports[^{]*aspect-ratio/.test(header),
        });
        buf = '';
      } else if (ch === '}') {
        flush(stack.pop()!);
        buf = '';
      } else if (ch === ';') {
        const text = buf.trim();
        const top = stack[stack.length - 1];
        if (/^display:\s*(inline-)?grid/.test(text)) top.grid = true;
        top.decls.push({ text, line, allow: allowNext });
        allowNext = false;
        buf = '';
      } else {
        buf += ch;
      }
    }
    flush(stack[0]);
  }
  return offences;
}

describe('chromium 83 floor (q60 panel WebView)', () => {
  it('panel-runtime styles avoid flex gap, inset shorthand, and aspect-ratio', () => {
    const offences = scan();
    const msg = offences.map((o) => `${o.file}:${o.line}  ${o.text}`).join('\n');
    expect(offences, `\n${msg}\n`).toEqual([]);
  });
});
