import { describe, expect, it } from 'vitest';
import { synthwaveGridSvg, synthwaveGridUrl, synthwaveGridVars } from './synthwaveGrid';
import { synthwaveVars } from './skins';
import { normalizePanelSkin, skinAccentVars } from './skins';

const INK = { rows: '#2fe6ff', columns: '#ff3fd0' };

describe('Synthwave grid', () => {
  it('packs the rows tighter toward the horizon', () => {
    const d = /<path d="([^"]*H1600[^"]*)"/.exec(synthwaveGridSvg('dark', INK))?.[1] ?? '';
    const ys = [...d.matchAll(/M0 ([\d.]+)H1600/g)].map(m => Number(m[1]));
    expect(ys.length).toBeGreaterThan(5);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  });

  it('converges every column on one vanishing point at the horizon', () => {
    const svg = synthwaveGridSvg('dark', INK);
    const starts = [...svg.matchAll(/M([\d.]+) 0L/g)].map(m => m[1]);
    expect(starts.length).toBeGreaterThan(20);
    expect(new Set(starts).size).toBe(1);
  });

  it('fades to nothing at the horizon', () => {
    expect(synthwaveGridSvg('light', INK)).toContain('stop-opacity="0"');
  });

  it('is a pure data URI with no raster or script content', () => {
    const url = synthwaveGridUrl('dark', INK);
    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(url)).not.toMatch(/<script|<image|filter/);
  });

  it('reaches the skin through its accent vars', () => {
    const vars = skinAccentVars('synthwave', '#25d9f5');
    expect(Object.keys(synthwaveGridVars({ dark: INK, light: INK })).every(k => k in vars)).toBe(true);
    expect(vars['--skin-accent']).toBe('#25d9f5');
  });

  it('reads a stored ripple id as the stock look', () => {
    expect(normalizePanelSkin('ripple')).toBeNull();
    expect(normalizePanelSkin('synthwave')).toBe('synthwave');
  });

  it('keeps the original palette for the default cyan accent', () => {
    const v = synthwaveVars('#25d9f5');
    const near = (a: string, b: string) => {
      const x = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
      const y = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
      return Math.max(...x.map((c, i) => Math.abs(c - y[i])));
    };
    expect(near(v['--sw-back-dark'], '#120a2e')).toBeLessThan(10);
    expect(near(v['--sw-card-dark'], '#1a1040')).toBeLessThan(10);
    expect(near(v['--sw-line-dark'], '#5a3f9a')).toBeLessThan(10);
    const frame = v['--sw-frame-dark'].split(', ').map(Number);
    [255, 63, 208].forEach((c, i) => expect(Math.abs(frame[i] - c)).toBeLessThan(12));
  });

  it('follows the accent hue and stays neutral for a gray accent', () => {
    expect(synthwaveVars('#e63946')['--sw-card-dark']).not.toBe(synthwaveVars('#25d9f5')['--sw-card-dark']);
    const gray = synthwaveVars('#f0f0f0');
    expect(gray['--sw-card-dark']).toMatch(/^#([0-9a-f]{2})\1\1$/);
  });
});
