import { describe, expect, it } from 'vitest';
import { blossomSpots, sakuraFieldSvg } from './sakuraField';
import { sakuraBlossomVars } from './skins';

describe('Sakura blossom field', () => {
  it('scatters many blossoms of clearly different sizes', () => {
    const blossoms = blossomSpots().filter(s => !s.loose);
    const radii = blossoms.map(s => s.r);
    expect(blossoms.length).toBeGreaterThanOrEqual(60);
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(3);
  });

  it('is deterministic', () => {
    expect(sakuraFieldSvg('#aaaaaa', '#bbbbbb')).toBe(sakuraFieldSvg('#aaaaaa', '#bbbbbb'));
  });

  it('bakes the given colors into one image per mode', () => {
    const svg = sakuraFieldSvg('#112233', '#445566');
    expect(svg).toContain('#112233');
    expect(svg).toContain('#445566');
    const vars = sakuraBlossomVars('#2f6bff');
    expect(vars['--sk-field-dark']).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(vars['--sk-field-light']).not.toBe(vars['--sk-field-dark']);
  });
});
