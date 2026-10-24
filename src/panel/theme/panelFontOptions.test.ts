import { describe, expect, it } from 'vitest';
import { buildPanelFontOptions } from './panelFontOptions';

const labels = { bundled: 'Bundled', system: 'System' };

describe('buildPanelFontOptions', () => {
  it('lists only the embedded fonts, without headers, when no system families are offered', () => {
    const opts = buildPanelFontOptions(null, null, labels);
    expect(opts.map(o => o.value)).toEqual(['lexend', 'oswald', 'tektur', 'jura', 'piazzolla']);
    expect(opts.some(o => o.header)).toBe(false);
  });

  it('puts Bundled on top and System below, each family drawn in its own face', () => {
    const opts = buildPanelFontOptions(['Zapfino', 'Arial'], null, labels);
    expect(opts.filter(o => o.header).map(o => o.label)).toEqual(['Bundled', 'System']);
    const idx = opts.findIndex(o => o.header && o.label === 'System');
    expect(opts.slice(idx + 1).map(o => o.value)).toEqual(['system:Arial', 'system:Zapfino']);
    expect(opts[idx + 1].fontFamily).toBe("'Arial', var(--panel-font)");
  });

  it('keeps a stored system font selectable when the host no longer lists it', () => {
    const opts = buildPanelFontOptions([], 'system:Gone Sans', labels);
    expect(opts.some(o => o.value === 'system:Gone Sans')).toBe(true);
  });
});
