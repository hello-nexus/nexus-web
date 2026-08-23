import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLightingDeviceColor } from '../../../api/lighting';
import { paletteColor } from '../../../types/lightingPalette';
import { defaultStateFor } from '../../../types/lighting';
import { pickLookForDevices, pickPaletteForDevices } from './staticPicks';

vi.mock('../../../api/lighting', () => ({
  setLightingDeviceColor: vi.fn(() => Promise.resolve()),
}));

describe('staticPicks', () => {
  beforeEach(() => vi.mocked(setLightingDeviceColor).mockClear());

  it('records one pick per device and pushes the whole look', () => {
    const state = { ...defaultStateFor('stripes'), hue: 0.5, saturation: 1, intensity: 0.8 };
    const next = pickLookForDevices({}, 'stripes', 2, state, ['a', 'b'], true);

    expect(next.a).toEqual(next.b);
    expect(next.a.key).toBe('stripes');
    // The slot travels with the pick: presets are shared and devices hold
    // references, so it is never resolved from the effect's own pointer.
    expect(next.a.slot).toBe(2);
    expect(setLightingDeviceColor).toHaveBeenCalledTimes(2);
    expect(vi.mocked(setLightingDeviceColor).mock.calls[0][3]).toMatchObject({
      effect: 'stripes', intensity: 0.8,
    });
  });

  it('records without touching hardware when the pick is not pushed', () => {
    const next = pickLookForDevices({}, 'stripes', 0, defaultStateFor('stripes'), ['a'], false);
    expect(next.a).toBeDefined();
    expect(setLightingDeviceColor).not.toHaveBeenCalled();
  });

  it('leaves devices outside the target list alone', () => {
    const prev = pickLookForDevices({}, 'stripes', 0, defaultStateFor('stripes'), ['a'], false);
    const next = pickPaletteForDevices(prev, paletteColor('red-3')!, ['b']);
    expect(next.a).toEqual(prev.a);
    expect(next.b.key).toBe('flat:red-3');
  });

  it('sends a palette pick as a colour, with no shader or params', () => {
    const red = paletteColor('red-3')!;
    const next = pickPaletteForDevices({}, red, ['a']);

    expect(next.a).toEqual({ key: 'flat:red-3', slot: 0, hex: red.hex });
    expect(setLightingDeviceColor).toHaveBeenCalledWith('a', red.h, red.s, {
      effect: 'flat', color: red.hex, intensity: 1, colorize: 0, contrast: 1, params: {},
    });
  });
});
