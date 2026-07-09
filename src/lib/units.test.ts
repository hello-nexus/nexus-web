import { describe, it, expect } from 'vitest';
import {
  convertTemperature, tempUnitSymbol, isCelsiusUnit,
  formatNumber, resolveHour12, localizeNumbers,
} from './units';

describe('convertTemperature', () => {
  it('is identity for celsius', () => {
    expect(convertTemperature(45, 'c')).toBe(45);
    expect(convertTemperature(-10, 'c')).toBe(-10);
  });
  it('converts celsius to fahrenheit', () => {
    expect(convertTemperature(0, 'f')).toBe(32);
    expect(convertTemperature(100, 'f')).toBe(212);
    expect(convertTemperature(45, 'f')).toBe(113);
  });
});

describe('tempUnitSymbol', () => {
  it('returns the degree symbol for each unit', () => {
    expect(tempUnitSymbol('c')).toBe('°C');
    expect(tempUnitSymbol('f')).toBe('°F');
  });
});

describe('isCelsiusUnit', () => {
  it('matches the service celsius unit leniently', () => {
    expect(isCelsiusUnit('°C')).toBe(true);
    expect(isCelsiusUnit('C')).toBe(true);
    expect(isCelsiusUnit(' °C ')).toBe(true);
  });
  it('rejects non-celsius units', () => {
    expect(isCelsiusUnit('°F')).toBe(false);
    expect(isCelsiusUnit('%')).toBe(false);
    expect(isCelsiusUnit('RPM')).toBe(false);
    expect(isCelsiusUnit('GHz')).toBe(false);
  });
});

describe('formatNumber', () => {
  it('uses period decimal / comma grouping for dot format', () => {
    expect(formatNumber(1234.56, 'dot')).toBe('1,234.56');
    expect(formatNumber(1800, 'dot')).toBe('1,800');
  });
  it('uses comma decimal / period grouping for comma format', () => {
    expect(formatNumber(1234.56, 'comma')).toBe('1.234,56');
    expect(formatNumber(1800, 'comma')).toBe('1.800');
  });
  it('honors formatting options', () => {
    expect(formatNumber(45.678, 'dot', { maximumFractionDigits: 0 })).toBe('46');
  });
  it('returns a string for the system format', () => {
    expect(typeof formatNumber(1234.5, 'system')).toBe('string');
  });
  it('passes non-finite values through', () => {
    expect(formatNumber(NaN, 'dot')).toBe('NaN');
    expect(formatNumber(Infinity, 'dot')).toBe('Infinity');
  });
});

describe('localizeNumbers', () => {
  it('is a no-op for the dot format (source form)', () => {
    expect(localizeNumbers('62.5 %', 'dot')).toBe('62.5 %');
    expect(localizeNumbers('10.3 / 31.1 GB', 'dot')).toBe('10.3 / 31.1 GB');
  });
  it('swaps decimal and grouping separators for the comma format', () => {
    expect(localizeNumbers('62.5 %', 'comma')).toBe('62,5 %');
    expect(localizeNumbers('3.6 GHz', 'comma')).toBe('3,6 GHz');
    expect(localizeNumbers('1,800 RPM', 'comma')).toBe('1.800 RPM');
    expect(localizeNumbers('10.3 / 31.1 GB', 'comma')).toBe('10,3 / 31,1 GB');
  });
  it('preserves grouping structure without inventing or dropping it', () => {
    expect(localizeNumbers('1800 RPM', 'comma')).toBe('1800 RPM');
    expect(localizeNumbers('1,234.56', 'comma')).toBe('1.234,56');
  });
  it('leaves non-numeric text alone', () => {
    expect(localizeNumbers('- ', 'comma')).toBe('- ');
    expect(localizeNumbers('N/A', 'comma')).toBe('N/A');
  });
});

describe('resolveHour12', () => {
  it('pins the explicit formats', () => {
    expect(resolveHour12('12h')).toBe(true);
    expect(resolveHour12('24h')).toBe(false);
  });
  it('derives a boolean from the runtime locale for system', () => {
    expect(typeof resolveHour12('system')).toBe('boolean');
  });
});
