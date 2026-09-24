import { describe, it, expect } from 'vitest';
import { onOpenBuild, requestOpenBuild } from './buildNav';

describe('buildNav', () => {
  it('encodes the path into one route segment, and stops after unsubscribe', () => {
    const received: string[] = [];
    const off = onOpenBuild(path => { received.push(path); });

    requestOpenBuild('/upgrade?bench=abc');
    expect(received).toEqual([encodeURIComponent('/upgrade?bench=abc')]);
    // No slash or query character survives unescaped, so a router that
    // splits on "/" or treats "?" as a query separator sees one opaque token.
    expect(received[0]).not.toMatch(/[/?&=]/);
    expect(decodeURIComponent(received[0])).toBe('/upgrade?bench=abc');

    off();
    requestOpenBuild('/upgrade?game=steam:730');
    expect(received).toHaveLength(1);
  });

  it('is a no-op with no listener registered', () => {
    expect(() => requestOpenBuild('/upgrade')).not.toThrow();
  });
});
