// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  COOLING_HISTORY_SERIES_QUERY,
  coolingSilhouettePoints,
  toCoolingTempChartSeries,
} from './coolingHistoryHelpers';
import type { MetricHistorySeries } from '../../../api/monitoringHistory';

function series(id: string, kind: MetricHistorySeries['kind'], points: MetricHistorySeries['points'], name = id): MetricHistorySeries {
  return { id, kind, name, points };
}

describe('COOLING_HISTORY_SERIES_QUERY', () => {
  it('requests every temperature kind plus fan speed', () => {
    expect(COOLING_HISTORY_SERIES_QUERY).toBe('cpu-temp,gpu-temp,mem-temp,drive-temp,fan');
  });
});

describe('toCoolingTempChartSeries', () => {
  it('drops the fan kind, keeping only the four temperature kinds', () => {
    const input = [
      series('cpu-temp', 'cpu-temp', [{ t: 0, avg: 50, max: 55 }], 'CPU'),
      series('fan:1', 'fan', [{ t: 0, avg: 1200, max: 1250 }], 'Fan 1'),
    ];
    const result = toCoolingTempChartSeries(input);
    expect(result.map(s => s.id)).toEqual(['cpu-temp']);
  });

  it('maps id/name/points and assigns each kind its fixed color', () => {
    const input = [
      series('cpu-temp', 'cpu-temp', [{ t: 0, avg: 50, max: 55 }], 'CPU'),
      series('gpu-temp:0', 'gpu-temp', [{ t: 0, avg: 40, max: 45 }], 'GPU'),
    ];
    const result = toCoolingTempChartSeries(input);
    expect(result).toEqual([
      { id: 'cpu-temp', name: 'CPU', color: '#3a89e8', points: [{ t: 0, avg: 50, max: 55 }] },
      { id: 'gpu-temp:0', name: 'GPU', color: '#00a1ab', points: [{ t: 0, avg: 40, max: 45 }] },
    ]);
  });

  it('sorts by kind (cpu, gpu, mem, drive) then id, regardless of input order', () => {
    const drive = series('drive-temp:b', 'drive-temp', [], 'Drive B');
    const mem = series('mem-temp', 'mem-temp', [], 'Memory');
    const gpu = series('gpu-temp:0', 'gpu-temp', [], 'GPU');
    const cpu = series('cpu-temp', 'cpu-temp', [], 'CPU');

    const result = toCoolingTempChartSeries([drive, mem, gpu, cpu]);
    expect(result.map(s => s.id)).toEqual(['cpu-temp', 'gpu-temp:0', 'mem-temp', 'drive-temp:b']);
  });

  it('gives two drives of the same kind distinct colors, ranked by sorted id (not array order)', () => {
    const driveA = series('drive-temp:a', 'drive-temp', [], 'Drive A');
    const driveB = series('drive-temp:b', 'drive-temp', [], 'Drive B');

    const forward = toCoolingTempChartSeries([driveA, driveB]);
    const reversed = toCoolingTempChartSeries([driveB, driveA]);
    expect(forward.find(s => s.id === 'drive-temp:a')?.color).not.toBe(forward.find(s => s.id === 'drive-temp:b')?.color);
    expect(reversed.find(s => s.id === 'drive-temp:a')?.color).toBe(forward.find(s => s.id === 'drive-temp:a')?.color);
    expect(reversed.find(s => s.id === 'drive-temp:b')?.color).toBe(forward.find(s => s.id === 'drive-temp:b')?.color);
  });
});

describe('coolingSilhouettePoints', () => {
  it('averages (not sums) matching timestamps across the temperature-kind series', () => {
    const cpu = series('cpu-temp', 'cpu-temp', [{ t: 0, avg: 40, max: 45 }, { t: 1000, avg: 60, max: 65 }]);
    const gpu = series('gpu-temp:0', 'gpu-temp', [{ t: 0, avg: 50, max: 60 }, { t: 1000, avg: 70, max: 75 }]);
    expect(coolingSilhouettePoints([cpu, gpu])).toEqual([
      { t: 0, avg: 45, max: 60 },
      { t: 1000, avg: 65, max: 75 },
    ]);
  });

  it('ignores fan series', () => {
    const cpu = series('cpu-temp', 'cpu-temp', [{ t: 0, avg: 40, max: 45 }]);
    const fan = series('fan:1', 'fan', [{ t: 0, avg: 1800, max: 1850 }]);
    expect(coolingSilhouettePoints([cpu, fan])).toEqual([{ t: 0, avg: 40, max: 45 }]);
  });

  it('keeps a timestamp present in only one series (no fan missing a tick treated as 0)', () => {
    const cpu = series('cpu-temp', 'cpu-temp', [{ t: 0, avg: 40, max: 45 }]);
    const gpu = series('gpu-temp:0', 'gpu-temp', [{ t: 1000, avg: 50, max: 55 }]);
    expect(coolingSilhouettePoints([cpu, gpu])).toEqual([
      { t: 0, avg: 40, max: 45 },
      { t: 1000, avg: 50, max: 55 },
    ]);
  });

  it('returns an empty array for no series', () => {
    expect(coolingSilhouettePoints([])).toEqual([]);
  });
});
