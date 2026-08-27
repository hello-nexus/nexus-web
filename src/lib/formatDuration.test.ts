// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
  it('formats sub-minute durations in seconds', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats sub-hour durations in minutes', () => {
    expect(formatDuration(20 * 60_000)).toBe('20m');
    expect(formatDuration(59 * 60_000 + 59_000)).toBe('59m');
  });

  it('formats hour-plus durations as hours and minutes', () => {
    expect(formatDuration(60 * 60_000)).toBe('1h 0m');
    expect(formatDuration(80 * 60_000)).toBe('1h 20m');
  });
});
