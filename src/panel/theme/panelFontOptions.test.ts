import { describe, expect, it, vi } from 'vitest';
import { buildPanelFontOptions, type SystemFontsGroup } from './panelFontOptions';

const labels = {
  bundled: 'Bundled', system: 'System', recent: 'Recent',
  load: 'Load system fonts', loading: 'Loading', empty: 'None found',
};
const onLoad = vi.fn();
const idle: SystemFontsGroup = { status: 'idle', families: null, onLoad };
const loaded = (families: string[]): SystemFontsGroup => ({ status: 'loaded', families, onLoad });
const headers = (opts: ReturnType<typeof buildPanelFontOptions>) => opts.filter(o => o.header).map(o => o.label);

describe('buildPanelFontOptions', () => {
  it('lists only the embedded fonts, without headers, when the System group is off', () => {
    const opts = buildPanelFontOptions(null, null, labels, ['Arial']);
    expect(opts.map(o => o.value)).toEqual(['lexend', 'oswald', 'tektur', 'jura', 'piazzolla']);
    expect(opts.some(o => o.header)).toBe(false);
  });

  it('before loading, System holds one action row and no families', () => {
    const opts = buildPanelFontOptions(idle, null, labels);
    expect(headers(opts)).toEqual(['Bundled', 'System']);
    const row = opts[opts.length - 1];
    expect(row.label).toBe('Load system fonts');
    expect(row.onAction).toBe(onLoad);
    expect(opts.filter(o => o.value.startsWith('system:'))).toEqual([]);
  });

  it('shows the in-flight and empty states on the action row', () => {
    const busy = buildPanelFontOptions({ ...idle, status: 'loading' }, null, labels).at(-1)!;
    expect([busy.label, busy.busy]).toEqual(['Loading', true]);
    const none = buildPanelFontOptions({ ...idle, status: 'empty' }, null, labels).at(-1)!;
    expect([none.label, none.busy]).toEqual(['None found', false]);
  });

  it('shows recents unfiltered before loading', () => {
    const opts = buildPanelFontOptions(idle, null, labels, ['Zapfino', 'Gone', 'Zapfino']);
    expect(headers(opts)).toEqual(['Bundled', 'Recent', 'System']);
    const r = opts.findIndex(o => o.label === 'Recent');
    const s = opts.findIndex(o => o.label === 'System');
    expect(opts.slice(r + 1, s).map(o => o.value)).toEqual(['system:Zapfino', 'system:Gone']);
  });

  it('keeps a stored system font as a row before loading', () => {
    const opts = buildPanelFontOptions(idle, 'system:Mine', labels);
    expect(opts.some(o => o.value === 'system:Mine')).toBe(true);
    const withRecent = buildPanelFontOptions(idle, 'system:Mine', labels, ['Mine']);
    expect(withRecent.filter(o => o.value === 'system:Mine')).toHaveLength(1);
  });

  it('after loading lists sorted families with no action row, recents limited to installed ones that also stay in System', () => {
    const opts = buildPanelFontOptions(loaded(['Arial', 'Zapfino', 'Courier']), null, labels, ['Zapfino', 'Gone', 'Arial']);
    expect(headers(opts)).toEqual(['Bundled', 'Recent', 'System']);
    expect(opts.some(o => o.onAction)).toBe(false);
    const r = opts.findIndex(o => o.label === 'Recent');
    const s = opts.findIndex(o => o.label === 'System');
    expect(opts.slice(r + 1, s).map(o => o.value)).toEqual(['system:Zapfino', 'system:Arial']);
    expect(opts.slice(s + 1).map(o => o.value)).toEqual(['system:Arial', 'system:Courier', 'system:Zapfino']);
    expect(opts[s + 1].fontFamily).toBe("'Arial', var(--panel-font)");
  });

  it('keeps a stored system font selectable after loading when the host no longer lists it', () => {
    const opts = buildPanelFontOptions(loaded(['Arial']), 'system:Gone', labels);
    expect(opts.some(o => o.value === 'system:Gone')).toBe(true);
  });

  it('omits Recent when empty', () => {
    expect(headers(buildPanelFontOptions(loaded(['Arial']), null, labels))).toEqual(['Bundled', 'System']);
  });
});
