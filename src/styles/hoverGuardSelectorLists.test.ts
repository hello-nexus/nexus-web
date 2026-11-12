// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as sass from 'sass';
import postcss from 'postcss';

// scripts/hover-guard-postcss.ts rewrites every :hover selector outside
// src/panel/ with a :where() guard, and Chromium 83 (the Q60 floor) cannot
// parse :where(), so it drops the whole rule. A rule whose selector list mixes
// a :hover selector with a non-hover one therefore loses its resting selector
// on that engine too. Keep hover and non-hover selectors in separate rules.

const SRC = join(__dirname, '..');

// Lists that predate this test; fix by splitting, never add to this set.
const KNOWN = new Set([
  "components/common/EffectCard/EffectCard.module.scss",
  "components/common/IconLabelButton/IconLabelButton.module.scss",
  "components/common/InfoTooltip/InfoTooltip.module.scss",
  "components/common/Select/Select.module.scss",
  "components/common/SupportedBrands/SupportedBrands.module.scss",
  "components/common/TroubleshootLink/TroubleshootLink.module.scss",
  "components/views/DiagnosticsView/DiagnosticsView.module.scss: .temperatureDayPickerInactive:hover, .temperatureDayPickerInactive:focus-within",
  "storybook/StorybookModal.module.scss",
]);

function scssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return p === join(SRC, 'panel') ? [] : scssFiles(p);
    return name.endsWith('.scss') && !name.startsWith('_') ? [p] : [];
  });
}

function hasTopLevelHover(selector: string): boolean {
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && selector.startsWith(':hover', i)) return true;
  }
  return false;
}

describe('hover guard selector lists', () => {
  it('no compiled rule outside src/panel mixes hover and non-hover selectors', () => {
    const files = scssFiles(SRC);
    expect(files.length).toBeGreaterThan(50); // the glob went stale if this trips
    const offences: string[] = [];
    for (const file of files) {
      const css = sass.compile(file, { logger: sass.Logger.silent }).css;
      postcss.parse(css).walkRules((rule) => {
        const parts = rule.selectors;
        if (parts.length < 2) return;
        const hover = parts.filter(hasTopLevelHover).length;
        const rel = relative(SRC, file);
        const sel = rule.selectors.join(', ');
        if (hover > 0 && hover < parts.length && !KNOWN.has(rel) && !KNOWN.has(`${rel}: ${sel}`)) offences.push(`${rel}: ${sel}`);
      });
    }
    expect(offences, `\n${offences.join('\n')}\n`).toEqual([]);
  });
});
