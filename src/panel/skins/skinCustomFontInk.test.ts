import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom does not compile SCSS or resolve the cascade, so the reset is checked in source: the
// ink hosts re-declare the skin numeral face and scale, and the custom-font reset must follow.
describe.each(['lcd', 'vfd'])('%s custom font reset', skin => {
  const src = readFileSync(join(__dirname, `${skin}.scss`), 'utf8');

  it('covers adaptive-ink hosts as well as the panel root', () => {
    const block = src.match(new RegExp(`(\\.panel-root\\[data-panel-skin='${skin}'\\]\\[data-skin-font-custom\\][^{]*)\\{[^}]*--skin-seg-scale: 1`));
    expect(block?.[1]).toContain('[data-theme]');
    expect(block?.[1]).toContain('[data-ink]');
  });
});
