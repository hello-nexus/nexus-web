import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearInks, customTextVars, normalizeTextColorMode, pickInk, resolveHostInk, smoothLuminance, stampInk, regionLuminance, relativeLuminance } from './textColor';

function solidGrid(width: number, height: number, [r, g, b]: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width, height };
}

describe('relativeLuminance', () => {
  it('spans black to white', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
  });
});

describe('pickInk', () => {
  it('puts white text on dark backdrops and black on light ones', () => {
    expect(pickInk(relativeLuminance(20, 10, 40), null)).toBe('light');
    expect(pickInk(relativeLuminance(240, 190, 180), null)).toBe('dark');
  });

  it('holds the current ink inside the hysteresis band', () => {
    expect(pickInk(0.2, 'light')).toBe('light');
    expect(pickInk(0.2, 'dark')).toBe('dark');
    expect(pickInk(0.16, 'dark')).toBe('dark');
    expect(pickInk(0.25, 'light')).toBe('dark');
    expect(pickInk(0.1, 'dark')).toBe('light');
  });
});

describe('pickInk theme bias', () => {
  it('dark theme: leaves white late and returns at the neutral crossover', () => {
    expect(pickInk(0.22, null, 'light')).toBe('light');
    expect(pickInk(0.22, 'light', 'light')).toBe('light');
    expect(pickInk(0.28, 'light', 'light')).toBe('dark');
    expect(pickInk(0.2, 'dark', 'light')).toBe('dark');
    expect(pickInk(0.17, 'dark', 'light')).toBe('light');
  });

  it('light theme: leaves black late and returns at the neutral crossover', () => {
    expect(pickInk(0.14, null, 'dark')).toBe('dark');
    expect(pickInk(0.14, 'dark', 'dark')).toBe('dark');
    expect(pickInk(0.1, 'dark', 'dark')).toBe('light');
    expect(pickInk(0.16, 'light', 'dark')).toBe('light');
    expect(pickInk(0.19, 'light', 'dark')).toBe('dark');
  });

  it('keeps the symmetric hysteresis band without a theme ink', () => {
    expect(pickInk(0.22, null)).toBe('dark');
    expect(pickInk(0.2, 'light')).toBe('light');
    expect(pickInk(0.2, 'dark')).toBe('dark');
    expect(pickInk(0.25, 'light')).toBe('dark');
    expect(pickInk(0.1, 'dark')).toBe('light');
  });

  it('follows a theme switch on the next pick', () => {
    expect(pickInk(0.22, 'light', 'light')).toBe('light');
    expect(pickInk(0.22, 'light', 'dark')).toBe('dark');
  });
});

describe('resolveHostInk on a theme switch', () => {
  it('dark to light theme judges an in-band sample like a fresh load', () => {
    const host = document.createElement('div');
    host.dataset.ink = 'light';
    expect(resolveHostInk(host, 0.15, 'dark', true)).toBe('dark');
  });

  it('light to dark theme judges an in-band sample like a fresh load', () => {
    const host = document.createElement('div');
    host.dataset.ink = 'dark';
    expect(resolveHostInk(host, 0.22, 'light', true)).toBe('light');
  });

  it('keeps the stamp as history on an ordinary tick', () => {
    const host = document.createElement('div');
    host.dataset.ink = 'light';
    expect(resolveHostInk(host, 0.15, 'dark', false)).toBe('light');
  });
});

describe('smoothLuminance', () => {
  it('seeds with the first sample', () => {
    const host = document.createElement('div');
    expect(smoothLuminance(host, 0.4)).toBe(0.4);
  });

  it('does not let a single-tick spike flip the ink', () => {
    const host = document.createElement('div');
    smoothLuminance(host, 0.15);
    smoothLuminance(host, 0.15);
    const spiked = smoothLuminance(host, 0.5);
    expect(spiked).toBeLessThan(0.274);
    expect(pickInk(spiked, 'light', 'light')).toBe('light');
  });

  it('settles on a sustained change and resets on clearInks', () => {
    const host = document.createElement('div');
    const root = document.createElement('div');
    root.appendChild(host);
    host.dataset.ink = 'light';
    smoothLuminance(host, 0.1);
    let v = 0;
    for (let i = 0; i < 20; i++) v = smoothLuminance(host, 0.5);
    expect(v).toBeGreaterThan(0.49);
    clearInks(root);
    expect(smoothLuminance(host, 0.1)).toBe(0.1);
  });
});

describe('regionLuminance', () => {
  it('averages only the cells inside the region', () => {
    const grid = solidGrid(4, 2, [0, 0, 0]);
    grid.data.set([255, 255, 255, 255], 0);
    expect(regionLuminance(grid, 0, 0, 1, 1, [0, 0, 0, 0])).toBeCloseTo(1, 5);
    expect(regionLuminance(grid, 0, 0, 2, 1, [0, 0, 0, 0])).toBeCloseTo(0.5, 5);
  });

  it('composites the card fill over the backdrop', () => {
    const grid = solidGrid(2, 2, [255, 255, 255]);
    expect(regionLuminance(grid, 0, 0, 2, 2, [0, 0, 0, 1])).toBe(0);
    expect(regionLuminance(grid, 0, 0, 2, 2, [0, 0, 0, 0])).toBeCloseTo(1, 5);
  });

  it('is null when the region misses the grid', () => {
    expect(regionLuminance(solidGrid(2, 2, [0, 0, 0]), 3, 0, 5, 2, [0, 0, 0, 0])).toBeNull();
  });
});

describe('normalizeTextColorMode', () => {
  it('defaults to adaptive', () => {
    expect(normalizeTextColorMode(undefined)).toBe('adaptive');
    expect(normalizeTextColorMode('bogus')).toBe('adaptive');
    expect(normalizeTextColorMode('custom')).toBe('custom');
  });
});

describe('customTextVars', () => {
  it('derives every ink tier from the colour', () => {
    const vars = customTextVars('#F80') as Record<string, string>;
    expect(vars['--text']).toBe('#ff8800');
    expect(vars['--text-dim']).toBe('rgba(255, 136, 0, 0.6)');
    expect(vars['--panel-ink-accent']).toBe('#ff8800');
  });

  it('falls back to white for an unparseable colour', () => {
    expect((customTextVars('') as Record<string, string>)['--text']).toBe('#ffffff');
  });
});

function declarations(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...body.matchAll(/^\s*((?:--)?[\w-]+):\s*([^;]+);/gm)].map(m => [m[1], m[2].trim()]));
}

describe('adaptive ink palettes', () => {
  const variables = readFileSync(join(__dirname, '../../styles/variables.scss'), 'utf8');
  const tokens = readFileSync(join(__dirname, '../styles/tokens.scss'), 'utf8');
  // Accent is set per panel at runtime; the backdrop is what the ink is measured against.
  const themeOnly = /^--(accent|slider-fill-dim|backdrop-)/;

  it.each([
    ['light', ':root,\n[data-theme="dark"]'],
    ['dark', '[data-theme="light"]'],
  ])("ink '%s' carries every light-theme palette token at its theme value", (ink, themeSelector) => {
    const light = declarations(variables, '[data-theme="light"]');
    const theme = declarations(variables, themeSelector);
    const expected = Object.fromEntries(Object.keys(light).filter(k => !themeOnly.test(k)).map(k => [k, theme[k]]));
    expect(declarations(tokens, `.panel-root [data-ink='${ink}']`)).toEqual(expected);
  });
});

describe('ink fade window', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('does not fade a first stamp, fades a flip, and ends after the backstop', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    stampInk(host, 'light');
    expect(host.dataset.inkFade).toBeUndefined();
    stampInk(host, 'dark');
    expect(host.dataset.ink).toBe('dark');
    expect(host.dataset.inkFade).toBeDefined();
    vi.advanceTimersByTime(1000);
    expect(host.dataset.inkFade).toBeUndefined();
  });

  it('re-arms on a repeated flip', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    stampInk(host, 'light');
    stampInk(host, 'dark');
    vi.advanceTimersByTime(300);
    stampInk(host, 'light');
    vi.advanceTimersByTime(300);
    expect(host.dataset.inkFade).toBeDefined();
    vi.advanceTimersByTime(1000);
    expect(host.dataset.inkFade).toBeUndefined();
  });

  it('ends early on the host color transitionend only', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    const child = document.createElement('span');
    host.appendChild(child);
    stampInk(host, 'light');
    stampInk(host, 'dark');
    const end = (target: HTMLElement, propertyName: string) => {
      const e = new Event('transitionend', { bubbles: true });
      Object.assign(e, { propertyName });
      target.dispatchEvent(e);
    };
    end(child, 'color');
    end(host, 'opacity');
    expect(host.dataset.inkFade).toBeDefined();
    end(host, 'color');
    expect(host.dataset.inkFade).toBeUndefined();
  });

  it('clearInks removes stamps and a fade in flight', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const host = document.createElement('div');
    root.appendChild(host);
    stampInk(host, 'light');
    stampInk(host, 'dark');
    clearInks(root);
    expect(host.dataset.ink).toBeUndefined();
    expect(host.dataset.inkFade).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
