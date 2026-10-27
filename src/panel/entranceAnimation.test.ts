// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The host measures each .cellWrap for its input region and blur plates, so the entrance pop may not transform the wrap.
const scss = readFileSync(new URL('./PanelApp.module.scss', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
const rules = [...scss.matchAll(/([^{}]+)\{([^{}]*connectionIntroWidget[^{}]*)\}/g)].map(m => m[1].trim());

describe('widget entrance animation', () => {
  it('runs on the cell contents, never on the measured wrap', () => {
    const selectors = rules.filter(r => r.includes('.cellEntrance') || r.includes('data-home-intro')).flatMap(r => r.split(','));
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      expect(sel.trim(), sel).toMatch(/ > (\.cellHost > \*|\.cell|\.cellLabelStrip|\.cellImmersiveFrameLabel)$/);
    }
  });
});
