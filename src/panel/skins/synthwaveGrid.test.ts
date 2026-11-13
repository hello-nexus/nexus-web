import { describe, expect, it } from 'vitest';
import { synthwaveGridSvg, synthwaveGridUrl, synthwaveGridVars } from './synthwaveGrid';
import { normalizePanelSkin, skinAccentVars } from './skins';

describe('Synthwave grid', () => {
  it('packs the rows tighter toward the horizon', () => {
    const d = /<path d="([^"]*H160[^"]*)"/.exec(synthwaveGridSvg('dark'))?.[1] ?? '';
    const ys = [...d.matchAll(/M0 ([\d.]+)H160/g)].map(m => Number(m[1]));
    expect(ys.length).toBeGreaterThan(5);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  });

  it('converges every column on one vanishing point at the horizon', () => {
    const svg = synthwaveGridSvg('dark');
    const starts = [...svg.matchAll(/M([\d.]+) 0L/g)].map(m => m[1]);
    expect(starts.length).toBeGreaterThan(20);
    expect(new Set(starts).size).toBe(1);
  });

  it('fades to nothing at the horizon', () => {
    expect(synthwaveGridSvg('light')).toContain('stop-opacity="0"');
  });

  it('is a pure data URI with no raster or script content', () => {
    const url = synthwaveGridUrl('dark');
    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(url)).not.toMatch(/<script|<image|filter/);
  });

  it('reaches the skin through its accent vars', () => {
    const vars = skinAccentVars('synthwave', '#25d9f5');
    expect(Object.keys(synthwaveGridVars()).every(k => k in vars)).toBe(true);
    expect(vars['--skin-accent']).toBe('#25d9f5');
  });

  it('reads a stored ripple id as the stock look', () => {
    expect(normalizePanelSkin('ripple')).toBeNull();
    expect(normalizePanelSkin('synthwave')).toBe('synthwave');
  });
});
