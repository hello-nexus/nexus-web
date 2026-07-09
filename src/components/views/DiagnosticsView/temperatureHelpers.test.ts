import { describe, expect, it } from 'vitest';
import type { DiagnosticsTemperatureAppsResponse, DiagnosticsTemperatureEpisode, DiagnosticsTemperatureSeries } from '../../../api/diagnostics';
import {
  appsForHoverBucket,
  episodeBand,
  episodeDurationToken,
  episodeSentence,
  formatTemperatureCelsius,
  formatTemperatureDayLabel,
  minSelectableTemperatureDate,
  temperatureRangeLabelKey,
  temperatureSeriesColor,
  toChartSeries,
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

describe('toChartSeries', () => {
  it('maps id/name/points and assigns each kind its fixed color', () => {
    const series: DiagnosticsTemperatureSeries[] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: 0, avg: 50, max: 55 }] },
      { id: 'gpu:0', kind: 'gpu', name: 'GPU', points: [{ t: 0, avg: 40, max: 45 }] },
    ];
    const chartSeries = toChartSeries(series);
    expect(chartSeries).toEqual([
      { id: 'cpu', name: 'CPU', color: '#3a89e8', points: [{ t: 0, avg: 50, max: 55 }] },
      { id: 'gpu:0', name: 'GPU', color: '#00a1ab', points: [{ t: 0, avg: 40, max: 45 }] },
    ]);
    expect(chartSeries[0].color).not.toBe(chartSeries[1].color);
  });

  it('assigns the same color per id regardless of the input array order', () => {
    const cpu: DiagnosticsTemperatureSeries = { id: 'cpu', kind: 'cpu', name: 'CPU', points: [] };
    const gpu: DiagnosticsTemperatureSeries = { id: 'gpu:0', kind: 'gpu', name: 'GPU', points: [] };
    const storage: DiagnosticsTemperatureSeries = { id: 'storage:a', kind: 'storage', name: 'Drive A', points: [] };

    const forward = toChartSeries([cpu, gpu, storage]);
    const reversed = toChartSeries([storage, gpu, cpu]);
    const forwardById = new Map(forward.map(s => [s.id, s.color]));
    const reversedById = new Map(reversed.map(s => [s.id, s.color]));

    expect(reversedById.get('cpu')).toBe(forwardById.get('cpu'));
    expect(reversedById.get('gpu:0')).toBe(forwardById.get('gpu:0'));
    expect(reversedById.get('storage:a')).toBe(forwardById.get('storage:a'));
  });

  it('gives two drives of the same kind distinct colors, ranked by sorted id (not array order)', () => {
    const driveA: DiagnosticsTemperatureSeries = { id: 'storage:a', kind: 'storage', name: 'Drive A', points: [] };
    const driveB: DiagnosticsTemperatureSeries = { id: 'storage:b', kind: 'storage', name: 'Drive B', points: [] };

    const forward = toChartSeries([driveA, driveB]);
    const reversed = toChartSeries([driveB, driveA]);
    expect(forward.find(s => s.id === 'storage:a')?.color).not.toBe(forward.find(s => s.id === 'storage:b')?.color);
    expect(reversed.find(s => s.id === 'storage:a')?.color).toBe(forward.find(s => s.id === 'storage:a')?.color);
    expect(reversed.find(s => s.id === 'storage:b')?.color).toBe(forward.find(s => s.id === 'storage:b')?.color);
  });

  it('sorts the legend by kind order (cpu, gpu, ram, storage) then id, regardless of input order', () => {
    const storage: DiagnosticsTemperatureSeries = { id: 'storage:a', kind: 'storage', name: 'Drive A', points: [] };
    const ram: DiagnosticsTemperatureSeries = { id: 'ram:0', kind: 'ram', name: 'RAM', points: [] };
    const gpu: DiagnosticsTemperatureSeries = { id: 'gpu:0', kind: 'gpu', name: 'GPU', points: [] };
    const cpu: DiagnosticsTemperatureSeries = { id: 'cpu', kind: 'cpu', name: 'CPU', points: [] };

    const chartSeries = toChartSeries([storage, ram, gpu, cpu]);
    expect(chartSeries.map(s => s.id)).toEqual(['cpu', 'gpu:0', 'ram:0', 'storage:a']);
  });
});

describe('xTickFormatForRange', () => {
  it('returns a working formatter for every range bucket', () => {
    const t = new Date('2026-07-08T14:30:00Z').getTime();
    expect(xTickFormatForRange(24)(t)).toEqual(expect.any(String));
    expect(xTickFormatForRange(72)(t)).toEqual(expect.any(String));
    expect(xTickFormatForRange(168)(t)).toEqual(expect.any(String));
    expect(xTickFormatForRange(336)(t)).toEqual(expect.any(String));
  });
});

describe('minSelectableTemperatureDate', () => {
  it('subtracts retentionDays - 1 from today, inclusive', () => {
    expect(minSelectableTemperatureDate('2026-07-08', 90)).toBe('2026-04-10');
    expect(minSelectableTemperatureDate('2026-07-08', 1)).toBe('2026-07-08');
    expect(minSelectableTemperatureDate('2026-01-01', 5)).toBe('2025-12-28');
  });
});

describe('formatTemperatureDayLabel', () => {
  it('formats an ISO day into a readable date', () => {
    expect(formatTemperatureDayLabel('2026-07-08')).toEqual(expect.any(String));
    expect(formatTemperatureDayLabel('2026-07-08')).not.toBe('2026-07-08');
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

describe('appsForHoverBucket', () => {
  function appsData(overrides: Partial<DiagnosticsTemperatureAppsResponse> = {}): DiagnosticsTemperatureAppsResponse {
    return {
      supported: true,
      bucketMinutes: 30,
      buckets: [
        {
          startUtcMs: 0,
          apps: [
            { appName: 'Google Chrome', appId: 'Google Chrome', ms: 1_200_000 },
            { appName: 'Slack', appId: 'Slack', ms: 300_000 },
          ],
        },
      ],
      ...overrides,
    };
  }
  const BUCKET_MS = 30 * 60_000;

  it('finds the bucket containing t and returns its apps dominant-first', () => {
    expect(appsForHoverBucket(appsData(), 0)).toEqual([
      { appId: 'Google Chrome', appName: 'Google Chrome', ms: 1_200_000 },
      { appId: 'Slack', appName: 'Slack', ms: 300_000 },
    ]);
    expect(appsForHoverBucket(appsData(), BUCKET_MS - 1)).toHaveLength(2);
  });

  it('re-sorts by ms descending regardless of input order', () => {
    const data = appsData({
      buckets: [{
        startUtcMs: 0,
        apps: [
          { appName: 'Slack', appId: 'Slack', ms: 300_000 },
          { appName: 'Google Chrome', appId: 'Google Chrome', ms: 1_200_000 },
        ],
      }],
    });
    expect(appsForHoverBucket(data, 0).map(a => a.appId)).toEqual(['Google Chrome', 'Slack']);
  });

  it('caps to the top 4 apps', () => {
    const data = appsData({
      buckets: [{
        startUtcMs: 0,
        apps: Array.from({ length: 6 }, (_, i) => ({ appName: `App ${i}`, appId: `App ${i}`, ms: (6 - i) * 60_000 })),
      }],
    });
    expect(appsForHoverBucket(data, 0)).toHaveLength(4);
  });

  it('returns [] when t falls outside every bucket', () => {
    expect(appsForHoverBucket(appsData(), BUCKET_MS)).toEqual([]);
    expect(appsForHoverBucket(appsData(), -1)).toEqual([]);
  });

  it('returns [] when data is null or unsupported', () => {
    expect(appsForHoverBucket(null, 0)).toEqual([]);
    expect(appsForHoverBucket(appsData({ supported: false }), 0)).toEqual([]);
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
