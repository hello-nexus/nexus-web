import { describe, it, expect } from 'vitest';
import { onOpenBuild, requestOpenBuild } from './buildNav';

describe('buildNav', () => {
  it('announces the path via the window event, and stops after unsubscribe', () => {
    const received: string[] = [];
    const off = onOpenBuild(path => { received.push(path); });

    requestOpenBuild('/upgrade?bench=abc');
    expect(received).toEqual(['/upgrade?bench=abc']);

    off();
    requestOpenBuild('/upgrade?game=steam:730');
    expect(received).toEqual(['/upgrade?bench=abc']);
  });

  it('is a no-op with no listener registered', () => {
    expect(() => requestOpenBuild('/upgrade')).not.toThrow();
  });
});
