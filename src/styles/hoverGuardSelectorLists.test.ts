// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as sass from 'sass';
import postcss from 'postcss';
import { hasTopLevelHover } from '../../scripts/hover-guard-postcss';

// scripts/hover-guard-postcss.ts rewrites every :hover selector outside
// src/panel/ with a :where() guard, and Chromium 83 (the Q60 floor) cannot
// parse :where(), so it drops the whole rule. A rule whose selector list mixes
// a :hover selector with a non-hover one therefore loses its resting selector
// on that engine too. Keep hover and non-hover selectors in separate rules.

const SRC = join(__dirname, '..');

// Lists that predate this test; fix by splitting, never add to this set.
const KNOWN = new Set<string>([
  "components/common/EffectCard/EffectCard.module.scss: :global(body[data-pointer='mouse']) .card:hover [data-edit-hint-overlay], :global(body[data-pointer='mouse']) .card:focus-visible [data-edit-hint-overlay], :global(body[data-pointer='mouse']) .card[data-edit-hint-shown] [data-edit-hint-overlay]",
  "components/common/EffectCard/EffectCard.module.scss: .card:hover [data-card-delete=hover], .card:focus-within [data-card-delete=hover]",
  "components/common/IconLabelButton/IconLabelButton.module.scss: .button[data-active=true], .button[data-active=true]:hover:not(:disabled), .button[data-active=true]:active:not(:disabled)",
  "components/common/InfoTooltip/InfoTooltip.module.scss: .warning, .warning:hover, .warning:focus-visible",
  "components/common/InfoTooltip/InfoTooltip.module.scss: .critical, .critical:hover, .critical:focus-visible",
  "components/common/Select/Select.module.scss: .wrapper:hover .chevron, .wrapper:focus-within .chevron",
  "components/common/SupportedBrands/SupportedBrands.module.scss: .brand:hover, .brand[aria-current=true]",
  "components/common/TroubleshootLink/TroubleshootLink.module.scss: .link:hover, .link:focus-visible",
  "components/views/DiagnosticsView/DiagnosticsView.module.scss: .temperatureDayPickerInactive:hover, .temperatureDayPickerInactive:focus-within",
  "storybook/StorybookModal.module.scss: .previewHoverCard:hover [data-card-delete=hover], .previewHoverCard:focus-within [data-card-delete=hover]",
]);

function scssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return p === join(SRC, 'panel') ? [] : scssFiles(p);
    return name.endsWith('.scss') && !name.startsWith('_') ? [p] : [];
  });
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
        if (hover > 0 && hover < parts.length && !KNOWN.has(`${rel}: ${sel}`)) offences.push(`${rel}: ${sel}`);
      });
    }
    expect(offences, `\n${offences.join('\n')}\n`).toEqual([]);
  });
});
