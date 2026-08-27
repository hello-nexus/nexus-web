// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatGameDuration } from './formatGameDuration';

describe('formatGameDuration', () => {
  it('formats zero', () => {
    expect(formatGameDuration(0)).toBe('0:00');
  });

  it('pads single-digit seconds', () => {
    expect(formatGameDuration(5000)).toBe('0:05');
  });

  it('formats minutes and seconds', () => {
    expect(formatGameDuration(125_000)).toBe('2:05');
  });

  it('floors partial seconds', () => {
    expect(formatGameDuration(1999)).toBe('0:01');
  });

  it('clamps a negative duration to zero', () => {
    expect(formatGameDuration(-500)).toBe('0:00');
  });
});
