import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import * as sass from 'sass';
import { describe, expect, it } from 'vitest';

// Inline slider width has one source: --slider-inline-* in styles/global.scss, consumed
// by Slider and SettingRow. This scan covers the SCSS side; eslint.config.js covers TSX.
// Style modules are compiled with sass first, so nesting, & and @media are flattened
// before the rules are read.
const SRC = resolve(__dirname, '../../..');
const OWNERS = ['components/common/Slider/Slider.module.scss', 'components/common/SettingRow/SettingRow.module.scss', 'styles/global.scss'];
const SIZING = /(^|[\s;{])(width|min-width|max-width|inline-size|flex-basis|flex|grid-template-columns)\s*:/;
// Classes handed to an inline Slider that may size it. Each entry: file relative to src, class, reason.
const ALLOWED: Array<{ file: string; cls: string; reason: string }> = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function compile(file: string): string {
  return sass.compile(file, { loadPaths: [SRC], logger: sass.Logger.silent }).css;
}

// Declaration blocks of every compiled rule whose selector names `.cls` as a class.
function declarationsOf(css: string, cls: string): string[] {
  const named = new RegExp(`\\.${cls}(?![\\w-])`);
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => named.test(m[1])).map(m => m[2]);
}

// An inline slider: SettingSlider, or a Slider with no orientation or an inline one.
function inlineSliderTags(src: string): string[] {
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
    const tag = src.slice(m.index, j);
    const orientation = /orientation=(?:"(\w+)"|\{(\w+)\})/.exec(tag);
    const inline = m[1] === 'SettingSlider' || !orientation || /^(inline|INLINE)$/.test(orientation[1] ?? orientation[2]);
    if (inline) tags.push(tag);
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

  it('no class handed to an inline slider sizes it', () => {
    const offenders: string[] = [];
    for (const file of files.filter(f => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))) {
      const src = readFileSync(file, 'utf8');
      const tags = inlineSliderTags(src);
      if (tags.length === 0) continue;
      for (const imp of src.matchAll(/import (\w+) from '(\.[^']+\.module\.scss)'/g)) {
        const css = compile(resolve(dirname(file), imp[2]));
        for (const tag of tags) {
          for (const m of tag.matchAll(new RegExp(`${imp[1]}\\.(\\w+)`, 'g'))) {
            const allowed = ALLOWED.some(a => a.file === relative(SRC, file) && a.cls === m[1]);
            if (!allowed && declarationsOf(css, m[1]).some(body => SIZING.test(body))) offenders.push(`${relative(SRC, file)}: .${m[1]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reads sizing out of nested and pseudo-class rules', () => {
    const css = compile(resolve(SRC, 'components/common/Slider/Slider.module.scss'));
    expect(declarationsOf(css, 'inlineControl').some(b => SIZING.test(b))).toBe(true);
    const nested = sass.compileString('.x { color: red; &:hover { width: 3rem; } }').css;
    expect(declarationsOf(nested, 'x').some(b => SIZING.test(b))).toBe(true);
    expect(declarationsOf(sass.compileString('.x { gap: 3rem; }').css, 'x').some(b => SIZING.test(b))).toBe(false);
  });
});
