import { describe, it, expect } from 'vitest';
import { formatMemoryMb } from './formatMemory';

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
