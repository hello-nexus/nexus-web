import { describe, expect, it } from 'vitest';
import type { DiagnosticsTemperatureEpisode, DiagnosticsTemperatureSeries } from '../../../api/diagnostics';
import {
  episodeBand,
  episodeDurationToken,
  episodeSentence,
  formatTemperatureCelsius,
  temperatureRangeLabelKey,
  toChartSeries,
  xTickFormatForRange,
} from './temperatureHelpers';

describe('temperatureRangeLabelKey', () => {
  it('maps every supported range to its key', () => {
    expect(temperatureRangeLabelKey(24)).toBe('diagnostics.temperature.range.24h');
    expect(temperatureRangeLabelKey(72)).toBe('diagnostics.temperature.range.3d');
    expect(temperatureRangeLabelKey(168)).toBe('diagnostics.temperature.range.7d');
    expect(temperatureRangeLabelKey(720)).toBe('diagnostics.temperature.range.30d');
  });
});

describe('toChartSeries', () => {
  it('maps id/name/points and assigns a stable color per series id', () => {
    const series: DiagnosticsTemperatureSeries[] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: 0, avg: 50, max: 55 }] },
      { id: 'gpu:0', kind: 'gpu', name: 'GPU', points: [{ t: 0, avg: 40, max: 45 }] },
    ];
    const chartSeries = toChartSeries(series);
    expect(chartSeries).toEqual([
      { id: 'cpu', name: 'CPU', color: expect.any(String), points: [{ t: 0, avg: 50, max: 55 }] },
      { id: 'gpu:0', name: 'GPU', color: expect.any(String), points: [{ t: 0, avg: 40, max: 45 }] },
    ]);
    expect(chartSeries[0].color).not.toBe(chartSeries[1].color);
    // Same id -> same color across calls (the shared name->color map is stable).
    expect(toChartSeries(series)[0].color).toBe(chartSeries[0].color);
  });
});

describe('xTickFormatForRange', () => {
  it('returns a working formatter for every range bucket', () => {
    const t = new Date('2026-07-08T14:30:00Z').getTime();
    expect(xTickFormatForRange(24)(t)).toEqual(expect.any(String));
    expect(xTickFormatForRange(72)(t)).toEqual(expect.any(String));
    expect(xTickFormatForRange(168)(t)).toEqual(expect.any(String));
    expect(xTickFormatForRange(720)(t)).toEqual(expect.any(String));
  });
});

describe('formatTemperatureCelsius', () => {
  it('converts and appends the unit symbol', () => {
    expect(formatTemperatureCelsius(20, 'c', 'dot')).toBe('20°C');
    expect(formatTemperatureCelsius(0, 'f', 'dot')).toBe('32°F');
  });
});

describe('episodeDurationToken', () => {
  it('buckets under an hour as minutes', () => {
    expect(episodeDurationToken('2026-07-05T12:00:00Z', '2026-07-05T12:20:00Z')).toEqual({
      key: 'diagnostics.duration.minutes', params: { m: '20' },
    });
  });

  it('buckets an hour or more as hours+minutes', () => {
    expect(episodeDurationToken('2026-07-05T12:00:00Z', '2026-07-05T13:30:00Z')).toEqual({
      key: 'diagnostics.duration.hoursMinutes', params: { h: '1', m: '30' },
    });
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

describe('episodeSentence', () => {
  it('composes the name/peak/duration/date sentence via the translate function', () => {
    const episode: DiagnosticsTemperatureEpisode = {
      componentId: 'gpu:0', name: 'RTX 5080', startUtc: '2026-07-05T12:00:00Z', endUtc: '2026-07-05T12:20:00Z',
      peakC: 93, thresholdC: 85,
    };
    const translate = (key: string, params?: Record<string, string>) => {
      if (key === 'diagnostics.temperature.episode') {
        return `${params?.name} reached ${params?.peak} for ${params?.duration} on ${params?.date}`;
      }
      if (key === 'diagnostics.duration.minutes') return `${params?.m}m`;
      return key;
    };
    const sentence = episodeSentence(episode, 'c', 'dot', translate);
    expect(sentence).toBe(`RTX 5080 reached 93°C for 20m on ${new Date('2026-07-05T12:20:00Z').toLocaleDateString()}`);
  });
});
