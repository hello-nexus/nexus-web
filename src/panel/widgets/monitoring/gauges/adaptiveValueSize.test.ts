import { describe, expect, it } from 'vitest';
import { VALUE_MAX_PX, fitValueFontSize, widestReading } from './adaptiveValueSize';

describe('widestReading', () => {
  it('depends on the unit alone, so a ticking value cannot move it', () => {
    expect(widestReading('°C')).toBe('100');
    expect(widestReading('MHz')).toBe('8,888');
  });
  it('reserves more width for MHz than for degrees', () => {
    expect(widestReading('MHz').length).toBeGreaterThan(widestReading('°C').length);
  });
  it('gives an unknown unit a fixed digit count', () => {
    expect(widestReading('zz')).toBe('8888');
    expect(widestReading('')).toBe('8888');
  });
});

describe('fitValueFontSize', () => {
  it('gives a wider reading a smaller size in the same box', () => {
    expect(fitValueFontSize(200, 200, 5.4, 10) as number).toBeLessThan(fitValueFontSize(200, 200, 3.2, 10) as number);
  });
  it('never goes below the floor', () => {
    expect(fitValueFontSize(10, 10, 5, 22)).toBe(22);
  });
  it('caps at the max when the floor is lower', () => {
    expect(fitValueFontSize(5000, 5000, 3, 22)).toBe(VALUE_MAX_PX);
  });
  it('returns undefined before measurement', () => {
    expect(fitValueFontSize(0, 100, 3, 20)).toBeUndefined();
    expect(fitValueFontSize(100, 100, 0, 20)).toBeUndefined();
  });
  it('caps ring growth at the short-side bound', () => {
    expect(fitValueFontSize(188, 188, 4, 22, 0.62)).toBe(Math.floor((188 * 0.62) / 4));
    expect(fitValueFontSize(5000, 5000, 4, 22, 0.62)).toBe(VALUE_MAX_PX);
  });
  it('keeps the floor when the ring fit is below it', () => {
    expect(fitValueFontSize(188, 188, 8, 22, 0.62)).toBe(22);
  });
});
