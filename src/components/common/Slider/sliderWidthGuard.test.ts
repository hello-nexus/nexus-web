import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Inline slider width has one source: --slider-inline-* in styles/global.scss, consumed
// by Slider and SettingRow. This scan covers the SCSS side; eslint.config.js covers TSX.
const SRC = resolve(__dirname, '../../..');
const OWNERS = ['components/common/Slider/Slider.module.scss', 'components/common/SettingRow/SettingRow.module.scss', 'styles/global.scss'];
const SIZING = /(^|[\s;{])(width|min-width|max-width|inline-size|flex-basis|flex|grid-template-columns)\s*:/;
// Classes handed to a Slider that may size it. Each entry: file relative to src, class, reason.
const ALLOWED: Array<{ file: string; cls: string; reason: string }> = [
  { file: 'panel/widgets/lighting/page/LedMapEditor.tsx', cls: 'brightnessTrack', reason: 'bare track with no label or value, fixed beside a swatch in the map toolbar' },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function declarationsOf(scss: string, cls: string): string[] {
  const found: string[] = [];
  const re = new RegExp(`\\.${cls}(?![\\w-])[^{}]*\\{([^{}]*)\\}`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(scss))) found.push(m[1]);
  return found;
}

function sliderTags(src: string): string[] {
  const tags: string[] = [];
  const re = /<(Slider|SettingSlider)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let j = m.index;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && src[j - 1] !== '=') break;
    }
    tags.push(src.slice(m.index, j));
  }
  return tags;
}

const files = walk(SRC);

describe('inline slider width guard', () => {
  it('only the owners define --slider-inline-*', () => {
    const offenders = files
      .filter(f => f.endsWith('.scss') && !OWNERS.includes(relative(SRC, f)))
      .filter(f => /--slider-inline-[\w-]*\s*:/.test(readFileSync(f, 'utf8')))
      .map(f => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('no class handed to a Slider or SettingSlider sizes it', () => {
    const offenders: string[] = [];
    for (const file of files.filter(f => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))) {
      const src = readFileSync(file, 'utf8');
      const tags = sliderTags(src);
      const imp = /import (\w+) from '(\.[^']+\.module\.scss)'/.exec(src);
      if (tags.length === 0 || !imp) continue;
      const sheet = readFileSync(resolve(dirname(file), imp[2]), 'utf8');
      for (const tag of tags) {
        for (const m of tag.matchAll(new RegExp(`${imp[1]}\\.(\\w+)`, 'g'))) {
          const allowed = ALLOWED.some(a => a.file === relative(SRC, file) && a.cls === m[1]);
          if (!allowed && declarationsOf(sheet, m[1]).some(body => SIZING.test(body))) offenders.push(`${relative(SRC, file)}: .${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the matcher tells a sizing rule from a layout one', () => {
    expect(declarationsOf('.x { width: 3rem; }', 'x').some(b => SIZING.test(b))).toBe(true);
    expect(declarationsOf('.x { gap: 3rem; }', 'x').some(b => SIZING.test(b))).toBe(false);
  });
});
