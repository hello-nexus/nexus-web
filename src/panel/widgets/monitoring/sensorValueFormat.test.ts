// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatScaledDataValue } from './sensorValueFormat';

describe('formatScaledDataValue', () => {
  it('keeps a whole number in its given unit with no decimal', () => {
    expect(formatScaledDataValue(700, 'MB')).toBe('700 MB');
    expect(formatScaledDataValue(0.5, 'GB')).toBe('512 MB');
  });

  it('rounds a fractional value to one decimal even without crossing a unit boundary', () => {
    expect(formatScaledDataValue(12.5, 'GB')).toBe('12.5 GB');
    expect(formatScaledDataValue(15.734212341, 'GB')).toBe('15.7 GB');
  });

  it('scales up across the ladder to one decimal', () => {
    expect(formatScaledDataValue(1400, 'MB')).toBe('1.4 GB');
    expect(formatScaledDataValue(1536, 'KB')).toBe('1.5 MB');
  });

  it('returns null for non-data units, including rate units', () => {
    expect(formatScaledDataValue(45, '°C')).toBeNull();
    expect(formatScaledDataValue(80, '%')).toBeNull();
    expect(formatScaledDataValue(120, 'MB/s')).toBeNull();
    expect(formatScaledDataValue(65, 'W')).toBeNull();
  });

  it('handles zero', () => {
    expect(formatScaledDataValue(0, 'MB')).toBe('0 MB');
  });

  it('is case-insensitive on the unit but requires an exact match', () => {
    expect(formatScaledDataValue(700, 'mb')).toBe('700 MB');
    expect(formatScaledDataValue(700, 'MBs')).toBeNull();
  });

  it('clamps negatives to 0 and rejects non-finite values', () => {
    expect(formatScaledDataValue(-5, 'MB')).toBe('0 MB');
    expect(formatScaledDataValue(Number.NaN, 'MB')).toBeNull();
    expect(formatScaledDataValue(Number.POSITIVE_INFINITY, 'MB')).toBeNull();
  });
});
