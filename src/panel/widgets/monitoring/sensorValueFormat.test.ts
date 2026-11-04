// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatScaledDataValue, formatSensorValue } from './sensorValueFormat';

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

describe('formatSensorValue per-type rule', () => {
  const fmt = (value: number, units: string, type: string, whole: boolean, temp: 'c' | 'f' = 'c', nf: 'system' | 'dot' | 'comma' = 'dot') =>
    formatSensorValue(value, units, 'svc', temp, nf, type, whole);

  it('keeps today decimals when whole numbers are off', () => {
    expect(fmt(35.34, '°C', 'Temperature', false)).toBe('35.3 °C');
    expect(fmt(97.94, 'W', 'Power', false)).toBe('97.9 W');
    expect(fmt(12.34, '%', 'Load', false)).toBe('12.3%');
    expect(fmt(0.85, 'V', 'Voltage', false)).toBe('0.850 V');
    expect(fmt(1.5, 'A', 'Current', false)).toBe('1.500 A');
    expect(fmt(2400.4, 'RPM', 'Fan', false)).toBe('2400 RPM');
    expect(fmt(1800.6, 'MHz', 'Clock', false)).toBe('1801 MHz');
    expect(fmt(16.66, 'ms', 'Framerate', false)).toBe('16.7 ms');
    expect(fmt(143.6, 'fps', 'Framerate', false)).toBe('144');
  });

  it('classifies unitless flow, noise and frequency by sensor type', () => {
    expect(fmt(120.46, 'L/h', 'Flow', false)).toBe('120.5');
    expect(fmt(31.25, 'dBA', 'Noise', false)).toBe('31.3');
    expect(fmt(60.04, 'Hz', 'Frequency', false)).toBe('60.0');
    expect(fmt(120.46, 'L/h', 'Flow', true)).toBe('120');
    expect(fmt(31.5, 'dBA', 'Noise', true)).toBe('32');
    expect(fmt(59.6, 'Hz', 'Frequency', true)).toBe('60');
  });

  it('rounds half away from zero when whole numbers are on', () => {
    expect(fmt(35.5, '°C', 'Temperature', true)).toBe('36 °C');
    expect(fmt(-2.5, '°C', 'Temperature', true)).toBe('-3 °C');
    expect(fmt(-0.4, '°C', 'Temperature', true)).toBe('0 °C');
    expect(fmt(97.94, 'W', 'Power', true)).toBe('98 W');
    expect(fmt(12.5, '%', 'Control', true)).toBe('13%');
    expect(fmt(55.5, '%', 'Level', true)).toBe('56%');
  });

  it('keeps voltage, current, frame time, clock, rpm and fps unchanged when on', () => {
    expect(fmt(0.85, 'V', 'Voltage', true)).toBe('0.850 V');
    expect(fmt(1.5, 'A', 'Current', true)).toBe('1.500 A');
    expect(fmt(16.66, 'ms', 'Framerate', true)).toBe('16.7 ms');
    expect(fmt(2400.4, 'RPM', 'Fan', true)).toBe('2400 RPM');
  });

  it('converts to Fahrenheit before rounding', () => {
    expect(fmt(35, '°C', 'Temperature', false, 'f')).toBe('95.0 °F');
    expect(fmt(35.3, '°C', 'Temperature', true, 'f')).toBe('96 °F');
  });

  it('applies the locale number format after rounding', () => {
    expect(fmt(35.34, '°C', 'Temperature', false, 'c', 'comma')).toBe('35,3 °C');
    expect(fmt(1234.56, 'W', 'Power', false, 'c', 'comma')).toBe('1234,6 W');
    expect(fmt(35.6, '°C', 'Temperature', true, 'c', 'comma')).toBe('36 °C');
  });

  it('leaves data scaling and unclassified sensors alone', () => {
    expect(formatSensorValue(1400, 'MB', '1400 MB', 'c', 'dot', 'SmallData', true)).toBe('1.4 GB');
    expect(formatSensorValue(5, 'mWh', '5 mWh', 'c', 'dot', 'Energy', true)).toBe('5 mWh');
  });
});
