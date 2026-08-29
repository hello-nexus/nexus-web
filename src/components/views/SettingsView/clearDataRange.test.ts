import { describe, expect, it } from 'vitest';
import { addDays, resolveClearDataRange } from './clearDataRange';

describe('resolveClearDataRange', () => {
  const today = '2026-08-28';
  const custom = { from: '2026-08-01', to: '2026-08-10' };

  it('today resolves to a single-day range', () => {
    expect(resolveClearDataRange('today', today, custom)).toEqual({ from: today, to: today });
  });

  it('last7Days resolves to a 7-day inclusive range ending today', () => {
    expect(resolveClearDataRange('last7Days', today, custom)).toEqual({ from: '2026-08-22', to: today });
  });

  it('last30Days resolves to a 30-day inclusive range ending today', () => {
    expect(resolveClearDataRange('last30Days', today, custom)).toEqual({ from: '2026-07-30', to: today });
  });

  it('last7Days crosses a month boundary correctly', () => {
    expect(resolveClearDataRange('last7Days', '2026-09-02', custom)).toEqual({ from: '2026-08-27', to: '2026-09-02' });
  });

  it('custom resolves to the picked from/to', () => {
    expect(resolveClearDataRange('custom', today, custom)).toEqual(custom);
  });

  it('custom returns null when from is after to', () => {
    expect(resolveClearDataRange('custom', today, { from: '2026-08-10', to: '2026-08-01' })).toBeNull();
  });

  it('custom returns null when either date is empty', () => {
    expect(resolveClearDataRange('custom', today, { from: '', to: '2026-08-10' })).toBeNull();
    expect(resolveClearDataRange('custom', today, { from: '2026-08-01', to: '' })).toBeNull();
  });

  it('allTime resolves to null so the caller uses the all-time delete', () => {
    expect(resolveClearDataRange('allTime', today, custom)).toBeNull();
  });
});

describe('addDays', () => {
  it('adds positive and negative day counts across month/year boundaries', () => {
    expect(addDays('2026-08-28', -6)).toBe('2026-08-22');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
