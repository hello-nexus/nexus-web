import { describe, expect, it } from 'vitest';
import { formatTimeZoneOffset, isValidTimeZone, listTimeZones, safeTimeZone } from './timezones';

describe('timezones', () => {
  it('accepts real IANA zones and rejects junk', () => {
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('j')).toBe(false);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it('safeTimeZone passes valid zones and collapses invalid ones to undefined', () => {
    expect(safeTimeZone('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(safeTimeZone('j')).toBeUndefined();
    expect(safeTimeZone(null)).toBeUndefined();
    expect(safeTimeZone(undefined)).toBeUndefined();
  });

  it('lists selectable zones including common ones', () => {
    const zones = listTimeZones();
    expect(zones.length).toBeGreaterThan(0);
    expect(zones).toContain('Asia/Tokyo');
    expect(zones.every(z => isValidTimeZone(z))).toBe(true);
  });

  it('formats a UTC offset label for a zone and empty for junk', () => {
    expect(formatTimeZoneOffset(new Date(), 'Asia/Tokyo')).toMatch(/^UTC/);
    expect(formatTimeZoneOffset(new Date(), 'j')).toBe('');
  });
});
