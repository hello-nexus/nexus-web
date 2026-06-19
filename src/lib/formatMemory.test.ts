import { describe, it, expect } from 'vitest';
import { formatMemoryMb, formatMemoryPair } from './formatMemory';

describe('formatMemoryMb', () => {
  it('stays in MB below 1 GiB, rounded to an integer', () => {
    expect(formatMemoryMb(0)).toBe('0 MB');
    expect(formatMemoryMb(511.6)).toBe('512 MB');
    expect(formatMemoryMb(1023)).toBe('1023 MB');
  });

  it('steps to GB at 1 GiB with one decimal', () => {
    expect(formatMemoryMb(1024)).toBe('1.0 GB');
    expect(formatMemoryMb(4096)).toBe('4.0 GB');
    expect(formatMemoryMb(24564)).toBe('24.0 GB');
  });
});

describe('formatMemoryPair', () => {
  it('shares one unit picked from the total', () => {
    expect(formatMemoryPair(12.4 * 1024, 31.11 * 1024)).toEqual({ used: '12.4', total: '31.1', unit: 'GB' });
    expect(formatMemoryPair(8 * 1024, 24 * 1024)).toEqual({ used: '8.0', total: '24.0', unit: 'GB' });
  });

  it('keeps MB when the total is below 1 GiB', () => {
    expect(formatMemoryPair(128, 512)).toEqual({ used: '128', total: '512', unit: 'MB' });
  });
});
