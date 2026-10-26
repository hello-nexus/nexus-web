import { describe, expect, it } from 'vitest';
import { curveRadius } from './curvedPanel';

describe('curveRadius', () => {
  it('only a monitor with a positive finite radius is curved', () => {
    expect(curveRadius({ kind: 'monitor', curve: { radiusMm: 1000 } })).toBe(1000);
    expect(curveRadius({ kind: 'monitor' })).toBeNull();
    expect(curveRadius({ kind: 'monitor', curve: { radiusMm: 0 } })).toBeNull();
    expect(curveRadius({ kind: 'monitor', curve: { radiusMm: Number.NaN } })).toBeNull();
    expect(curveRadius({ kind: 'keyboard', curve: { radiusMm: 1000 } })).toBeNull();
  });
});
