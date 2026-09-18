import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAUGE_GRADIENT,
  gaugeGradientColorAt,
  gaugeGradientCssStops,
  gaugeGradientEquals,
  MAX_GAUGE_GRADIENT_STOPS,
  mixHex,
  normalizeGaugeGradient,
  remapGaugeGradientToDomain,
} from './gaugeGradient';

describe('normalizeGaugeGradient', () => {
  it('falls back to the default for anything that is not a usable list', () => {
    for (const raw of [undefined, null, 'x', 3, [], [{ at: 0, color: '#ff0000' }], [{ at: 0 }, { at: 1 }]]) {
      expect(normalizeGaugeGradient(raw)).toEqual(DEFAULT_GAUGE_GRADIENT);
    }
  });

  it('sorts, clamps, lower-cases and drops malformed entries', () => {
    expect(normalizeGaugeGradient([
      { at: 1.4, color: '#EF4444' },
      { at: -2, color: '#2563EB' },
      { at: 0.5, color: 'red' },
      { at: 'half', color: '#ffffff' },
    ])).toEqual([{ at: 0, color: '#2563eb' }, { at: 1, color: '#ef4444' }]);
  });

  it('caps the stop count from the hot end', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ at: i / 7, color: '#123456' }));
    expect(normalizeGaugeGradient(many)).toHaveLength(MAX_GAUGE_GRADIENT_STOPS);
    expect(normalizeGaugeGradient(many)[0].at).toBe(0);
  });

  it('never returns the shared default instance', () => {
    expect(normalizeGaugeGradient(null)).not.toBe(DEFAULT_GAUGE_GRADIENT);
  });
});

describe('gaugeGradientColorAt', () => {
  const stops = [{ at: 0.2, color: '#000000' }, { at: 0.6, color: '#ffffff' }];

  it('is flat beyond the first and last stop', () => {
    expect(gaugeGradientColorAt(stops, 0)).toBe('#000000');
    expect(gaugeGradientColorAt(stops, 0.2)).toBe('#000000');
    expect(gaugeGradientColorAt(stops, 0.9)).toBe('#ffffff');
    expect(gaugeGradientColorAt(stops, 2)).toBe('#ffffff');
  });

  it('blends between neighbours', () => {
    expect(gaugeGradientColorAt(stops, 0.4)).toBe('#808080');
    expect(mixHex('#2563eb', '#f59e0b', 0.5)).toBe('#8d817b');
  });

  it('reads the default as light blue at empty and red past the limit', () => {
    expect(gaugeGradientColorAt(DEFAULT_GAUGE_GRADIENT, 0)).toBe('#4f80f0');
    expect(gaugeGradientColorAt(DEFAULT_GAUGE_GRADIENT, 0.95)).toBe('#ef4444');
  });
});

describe('gaugeGradientCssStops / equals', () => {
  it('emits percent positions a CSS gradient accepts', () => {
    expect(gaugeGradientCssStops([{ at: 0, color: '#000000' }, { at: 0.333, color: '#ffffff' }]))
      .toBe('#000000 0.00%, #ffffff 33.30%');
  });

  it('compares by value', () => {
    expect(gaugeGradientEquals(DEFAULT_GAUGE_GRADIENT, [...DEFAULT_GAUGE_GRADIENT])).toBe(true);
    expect(gaugeGradientEquals(DEFAULT_GAUGE_GRADIENT, DEFAULT_GAUGE_GRADIENT.slice(1))).toBe(false);
  });
});

describe('remapGaugeGradientToDomain', () => {
  const stops = [{ at: 0.2, color: '#000000' }, { at: 0.6, color: '#ffffff' }];
  const natural = (at: number) => at * 100;

  it('re-expresses the stops over a chart window that shows part of the scale', () => {
    // A chart stretched to 0-50: the 20 stop lands at 0.4 of it, the 60 stop is
    // off the top, and the top edge takes the colour the scale has at 50.
    expect(remapGaugeGradientToDomain(stops, natural, 0, 50)).toEqual([
      { at: 0, color: '#000000' },
      { at: 0.4, color: '#000000' },
      { at: 1, color: gaugeGradientColorAt(stops, 0.5) },
    ]);
  });

  it('is the identity over the full scale', () => {
    expect(remapGaugeGradientToDomain(stops, natural, 0, 100)).toEqual([
      { at: 0, color: '#000000' }, { at: 0.2, color: '#000000' }, { at: 0.6, color: '#ffffff' }, { at: 1, color: '#ffffff' },
    ]);
  });

  it('keeps a degenerate window from dividing by zero', () => {
    expect(remapGaugeGradientToDomain(stops, natural, 40, 40)).toEqual(stops);
  });
});
