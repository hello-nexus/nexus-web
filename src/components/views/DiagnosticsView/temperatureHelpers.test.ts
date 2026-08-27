// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DiagnosticsTemperatureEpisode } from '../../../api/diagnostics';
import {
  episodeBand,
  formatTemperatureCelsius,
  minSelectableTemperatureDate,
  temperatureRangeLabelKey,
  temperatureSeriesColor,
  xTickFormatForRange,
} from './temperatureHelpers';

describe('temperatureRangeLabelKey', () => {
  it('maps every supported range to its key', () => {
    expect(temperatureRangeLabelKey(24)).toBe('diagnostics.temperature.range.24h');
    expect(temperatureRangeLabelKey(72)).toBe('diagnostics.temperature.range.3d');
    expect(temperatureRangeLabelKey(168)).toBe('diagnostics.temperature.range.7d');
    expect(temperatureRangeLabelKey(336)).toBe('diagnostics.temperature.range.14d');
  });
});

describe('temperatureSeriesColor', () => {
  it('assigns a fixed color per hardware kind', () => {
    expect(temperatureSeriesColor('cpu', 0)).toBe('#3a89e8');
    expect(temperatureSeriesColor('gpu', 0)).toBe('#00a1ab');
    expect(temperatureSeriesColor('ram', 0)).toBe('#a860cd');
    expect(temperatureSeriesColor('storage', 0)).toBe('#d4569c');
  });

  it('shades a second/third instance of the same kind instead of reusing the base color', () => {
    const base = temperatureSeriesColor('storage', 0);
    const second = temperatureSeriesColor('storage', 1);
    const third = temperatureSeriesColor('storage', 2);
    expect(second).not.toBe(base);
    expect(third).not.toBe(base);
    expect(third).not.toBe(second);
  });

  it('resolves shades to a plain #rrggbb the SVG chart can render (not a color-mix string)', () => {
    const second = temperatureSeriesColor('storage', 1);
    expect(second).toMatch(/^#[0-9a-f]{6}$/);
    // #d4569c mixed 70% toward white, per channel: round(c*0.7 + 255*0.3).
    expect(second).toBe('#e189ba');
  });
});

describe('xTickFormatForRange', () => {
  it('returns a working formatter for every range bucket', () => {
    const t = new Date('2026-07-08T14:30:00Z').getTime();
    expect(xTickFormatForRange(24, 'system')(t)).toEqual(expect.any(String));
    expect(xTickFormatForRange(72, 'system')(t)).toEqual(expect.any(String));
    expect(xTickFormatForRange(168, 'system')(t)).toEqual(expect.any(String));
    expect(xTickFormatForRange(336, 'system')(t)).toEqual(expect.any(String));
  });
});

describe('minSelectableTemperatureDate', () => {
  it('subtracts retentionDays - 1 from today, inclusive', () => {
    expect(minSelectableTemperatureDate('2026-07-08', 90)).toBe('2026-04-10');
    expect(minSelectableTemperatureDate('2026-07-08', 1)).toBe('2026-07-08');
    expect(minSelectableTemperatureDate('2026-01-01', 5)).toBe('2025-12-28');
  });
});

describe('formatTemperatureCelsius', () => {
  it('converts and appends the unit symbol', () => {
    expect(formatTemperatureCelsius(20, 'c', 'dot')).toBe('20°C');
    expect(formatTemperatureCelsius(0, 'f', 'dot')).toBe('32°F');
  });
});

describe('episodeBand', () => {
  it('converts the episode span to millisecond timestamps with a warn color', () => {
    const episode: DiagnosticsTemperatureEpisode = {
      componentId: 'gpu:0', name: 'GPU', startUtc: '2026-07-05T12:00:00Z', endUtc: '2026-07-05T12:20:00Z',
      peakC: 93, thresholdC: 85,
    };
    expect(episodeBand(episode)).toEqual({
      startT: new Date('2026-07-05T12:00:00Z').getTime(),
      endT: new Date('2026-07-05T12:20:00Z').getTime(),
      color: 'var(--warn)',
    });
  });
});
