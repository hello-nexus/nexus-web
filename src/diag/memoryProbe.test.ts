import { describe, it, expect } from 'vitest';
import { shouldEmit, type MemSample } from './memoryProbe';

const base: MemSample = {
  surface: '/panel/y70',
  ageMin: 5,
  jsHeapMB: 200,
  jsHeapLimitMB: 2048,
  domNodes: 40_000,
  reconnects: 2,
  transport: 'lan',
  connected: true,
  topics: 9,
  listeners: 14,
};
const HOUR = 60 * 60_000;

describe('shouldEmit (sparse logging policy)', () => {
  it('always emits the first sample', () => {
    expect(shouldEmit(null, base, 0)).toBe(true);
  });

  it('stays silent when nothing moved meaningfully', () => {
    const next = { ...base, jsHeapMB: 240, domNodes: 43_000, ageMin: 6 };
    expect(shouldEmit(base, next, 30_000)).toBe(false);
  });

  it('emits when JS heap crosses a 100 MB step', () => {
    expect(shouldEmit(base, { ...base, jsHeapMB: 305 }, 30_000)).toBe(true);
  });

  it('emits on a large reclaim (GC / teardown) too', () => {
    const grown = { ...base, jsHeapMB: 900 };
    expect(shouldEmit(grown, { ...grown, jsHeapMB: 300 }, 30_000)).toBe(true);
  });

  it('emits when DOM node count crosses a 10k step', () => {
    expect(shouldEmit(base, { ...base, domNodes: 51_000 }, 30_000)).toBe(true);
  });

  it('emits the hourly heartbeat even when flat', () => {
    expect(shouldEmit(base, { ...base, ageMin: 65 }, HOUR)).toBe(true);
  });

  it('does not heap-gate when performance.memory is unavailable', () => {
    const noMem = { ...base, jsHeapMB: null, jsHeapLimitMB: null };
    const prev = { ...noMem };
    expect(shouldEmit(prev, { ...noMem, ageMin: 6 }, 30_000)).toBe(false);
    expect(shouldEmit(prev, { ...noMem, domNodes: 60_000 }, 30_000)).toBe(true);
  });
});
