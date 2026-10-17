import { describe, expect, it } from 'vitest';
import { slotHex } from './StaticColorSlots';

describe('slotHex', () => {
  const specs = {};
  it('reads a slot at its default uniform names', () => {
    expect(slotHex({ id: 'a', labelKey: 'x' }, { u_aHue: 0, u_aSat: 1, u_aVal: 1 }, specs)).toBe('#ff0000');
  });

  it('reads a slot whose shader names its uniforms after a block', () => {
    const slot = { id: 'b' as const, labelKey: 'x', uniformPrefix: 'u_col_b' };
    expect(slotHex(slot, { u_col_bHue: 1 / 3, u_col_bSat: 1, u_col_bVal: 1, u_bHue: 0 }, specs)).toBe('#00ff00');
  });
});
