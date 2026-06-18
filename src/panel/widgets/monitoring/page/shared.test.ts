import { describe, it, expect } from 'vitest';
import type { SeriesEntry } from '../../../../hooks/useProcessMonitor';
import { topNWithOther } from './shared';

const OTHER_COLOR_STUB = '#3a3a4f';

function makeSeries(name: string, avg: number, current: number, values?: number[]): SeriesEntry {
  const vals = values ?? new Array<number>(60).fill(avg);
  return { name, color: '#fff', values: vals, current, avg };
}

describe('topNWithOther', () => {
  it('returns top N by avg descending with a merged Other last', () => {
    const series = [
      makeSeries('A', 30, 30),
      makeSeries('B', 50, 50),
      makeSeries('C', 10, 10),
      makeSeries('D', 40, 40),
      makeSeries('E', 20, 20),
      makeSeries('F', 5, 5),
    ];
    const result = topNWithOther(series, 5);
    expect(result).toHaveLength(6);
    expect(result.map(s => s.name)).toEqual(['B', 'D', 'A', 'E', 'C', 'Other']);
    const other = result.find(s => s.name === 'Other')!;
    expect(other.avg).toBe(5);
    expect(other.current).toBe(5);
    expect(other.values).toHaveLength(60);
    expect(other.values[0]).toBe(5);
    expect(other.color).toBe(OTHER_COLOR_STUB);
  });

  it('folds a pre-existing Other into the bucket', () => {
    const preOther = makeSeries('Other', 8, 8);
    preOther.color = OTHER_COLOR_STUB;
    const series = [
      makeSeries('A', 30, 30),
      makeSeries('B', 50, 50),
      makeSeries('C', 10, 10),
      makeSeries('D', 40, 40),
      makeSeries('E', 20, 20),
      preOther,
    ];
    const result = topNWithOther(series, 5);
    // 5 real entries all fit in top 5, but pre-existing Other is always folded
    expect(result).toHaveLength(6);
    const other = result.find(s => s.name === 'Other')!;
    // pre-existing Other folds into bucket with no remainder (all 5 fit)
    expect(other.avg).toBe(8);
    expect(other.current).toBe(8);
  });

  it('sums values element-wise for the merged Other', () => {
    const valsF = new Array<number>(60).fill(3);
    const valsG = new Array<number>(60).fill(7);
    const series = [
      makeSeries('A', 50, 50),
      makeSeries('B', 40, 40),
      makeSeries('C', 30, 30),
      makeSeries('D', 20, 20),
      makeSeries('E', 10, 10),
      { name: 'F', color: '#f', values: valsF, current: 3, avg: 3 },
      { name: 'G', color: '#g', values: valsG, current: 7, avg: 7 },
    ];
    const result = topNWithOther(series, 5);
    const other = result.find(s => s.name === 'Other')!;
    expect(other.values[0]).toBe(10);
    expect(other.avg).toBe(10);
    expect(other.current).toBe(10);
  });

  it('returns no Other when entries are within n and no pre-existing Other', () => {
    const series = [
      makeSeries('A', 30, 30),
      makeSeries('B', 50, 50),
      makeSeries('C', 10, 10),
    ];
    const result = topNWithOther(series, 5);
    expect(result).toHaveLength(3);
    expect(result.find(s => s.name === 'Other')).toBeUndefined();
  });

  it('returns Other when exactly at n with a pre-existing Other', () => {
    const preOther = makeSeries('Other', 4, 4);
    const series = [
      makeSeries('A', 30, 30),
      makeSeries('B', 50, 50),
      makeSeries('C', 10, 10),
      preOther,
    ];
    const result = topNWithOther(series, 3);
    expect(result).toHaveLength(4);
    expect(result[result.length - 1].name).toBe('Other');
  });
});
