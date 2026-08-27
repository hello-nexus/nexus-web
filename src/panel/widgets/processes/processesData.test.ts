import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLUMN,
  DEFAULT_REFRESH_SECONDS,
  defaultDirectionFor,
  PROCESS_COLUMNS,
  rankableFor,
  resolveRefreshSeconds,
  sortModeForColumn,
  valueForColumn,
  type ProcessRow,
} from './processesData';

const row = (over: Partial<ProcessRow> = {}): ProcessRow => ({
  name: 'chrome', cpu: 10, memMb: 512, gpu: 4, ...over,
});

describe('resolveRefreshSeconds', () => {
  it('accepts the offered values', () => {
    for (const s of [1, 2, 3, 4, 5]) expect(resolveRefreshSeconds(s)).toBe(s);
  });

  it('falls back for anything not offered', () => {
    // A stored config can hold an older/hand-edited value; a sub-second one
    // especially must not get through, since the wire is a fixed 1 Hz.
    for (const bad of [0, 0.5, 6, 30, -1, null, undefined, 'fast', {}]) {
      expect(resolveRefreshSeconds(bad)).toBe(DEFAULT_REFRESH_SECONDS);
    }
  });

  it('accepts a numeric string, which is what a stored config can hold', () => {
    expect(resolveRefreshSeconds('3')).toBe(3);
  });
});

describe('sortModeForColumn', () => {
  it('maps each column onto one of processRanking\'s modes', () => {
    expect(sortModeForColumn('name')).toBe('name');
    expect(sortModeForColumn('cpu')).toBe('usage');
    expect(sortModeForColumn('ram')).toBe('usage');
    expect(sortModeForColumn('gpu')).toBe('usage');
  });
});

describe('defaultDirectionFor', () => {
  it('leads with the biggest for metrics', () => {
    expect(defaultDirectionFor('cpu')).toBe('desc');
    expect(defaultDirectionFor('ram')).toBe('desc');
    expect(defaultDirectionFor('gpu')).toBe('desc');
  });

  it('leads with A-Z for names', () => {
    expect(defaultDirectionFor('name')).toBe('asc');
  });
});

describe('valueForColumn', () => {
  it('reads the column\'s own metric', () => {
    expect(valueForColumn(row(), 'cpu')).toBe(10);
    expect(valueForColumn(row(), 'ram')).toBe(512);
    expect(valueForColumn(row(), 'gpu')).toBe(4);
  });

  it('reads 0 for a row with no GPU figure, so an absent source never outranks a real one', () => {
    expect(valueForColumn(row({ gpu: undefined }), 'gpu')).toBe(0);
  });

  it('reads 0 for the name column, which ranks through its own mode', () => {
    expect(valueForColumn(row(), 'name')).toBe(0);
  });
});

describe('rankableFor', () => {
  it('stamps the active column onto `current`, which is what compareItems ranks on', () => {
    const rows = [row({ name: 'a', cpu: 1, memMb: 900 }), row({ name: 'b', cpu: 50, memMb: 10 })];
    expect(rankableFor(rows, 'cpu').map(r => r.current)).toEqual([1, 50]);
    expect(rankableFor(rows, 'ram').map(r => r.current)).toEqual([900, 10]);
  });

  it('keeps every field the row carried, so the cells still render', () => {
    const [only] = rankableFor([row()], 'cpu');
    expect(only.name).toBe('chrome');
    expect(only.memMb).toBe(512);
    expect(only.gpu).toBe(4);
  });
});

describe('column set', () => {
  it('defaults to CPU, the column the list is most often read by', () => {
    expect(DEFAULT_COLUMN).toBe('cpu');
    expect(PROCESS_COLUMNS).toContain(DEFAULT_COLUMN);
  });
});
