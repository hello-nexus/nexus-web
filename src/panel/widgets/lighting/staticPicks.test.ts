// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLightingDeviceColor } from '../../../api/lighting';
import { paletteColor } from '../../../types/lightingPalette';
import { defaultStateFor } from '../../../types/lighting';
import {
  devicePicksFromLooks, lockedPicks, pickCustomForDevices, pickLookForDevices, pickPaletteForDevices,
  setPickLocked, unlockedIds,
} from './staticPicks';

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

  it('pushes a custom colour as a flat look carrying the exact hex', () => {
    const next = pickCustomForDevices({}, '#abcdef', ['a', 'b']);

    expect(next.a.hex).toBe('#abcdef');
    expect(setLightingDeviceColor).toHaveBeenCalledTimes(2);
    expect(vi.mocked(setLightingDeviceColor).mock.calls[0][3]).toMatchObject({
      effect: 'flat', color: '#abcdef',
    });
  });

  it('keeps a custom hex distinguishable from the palette id it snaps to', () => {
    // devicePicksFromLooks snaps every flat colour to a nearest palette id, so
    // the id alone would read an off-palette pick as an exact palette pick. The
    // stored hex is what separates them, and it must survive the round trip.
    const next = pickCustomForDevices({}, '#abcdef', ['a']);
    const restored = devicePicksFromLooks({
      a: { effect: 'flat', color: '#abcdef', hue: 0, saturation: 0, slot: 0 },
    } as Parameters<typeof devicePicksFromLooks>[0]);

    expect(restored.a.key).toBe(next.a.key);
    expect(restored.a.hex).toBe('#abcdef');
    expect(paletteColor(restored.a.key.replace('flat:', ''))?.hex).not.toBe('#abcdef');
  });

  describe('locks', () => {
    const locked = () => setPickLocked(pickCustomForDevices({}, '#112233', ['a', 'b'], false), 'a', true);

    it('leaves a locked device out of every pick, record and write alike', () => {
      const prev = locked();
      const red = paletteColor('red-3')!;

      const viaLook = pickLookForDevices(prev, 'stripes', 0, defaultStateFor('stripes'), ['a', 'b'], true);
      expect(viaLook.a).toEqual(prev.a);
      expect(viaLook.b.key).toBe('stripes');
      expect(setLightingDeviceColor).toHaveBeenCalledTimes(1);
      expect(vi.mocked(setLightingDeviceColor).mock.calls[0][0]).toBe('b');

      vi.mocked(setLightingDeviceColor).mockClear();
      const viaPalette = pickPaletteForDevices(prev, red, ['a', 'b']);
      expect(viaPalette.a).toEqual(prev.a);
      expect(viaPalette.b.key).toBe('flat:red-3');
      expect(setLightingDeviceColor).toHaveBeenCalledTimes(1);

      vi.mocked(setLightingDeviceColor).mockClear();
      const viaCustom = pickCustomForDevices(prev, '#abcdef', ['a', 'b']);
      expect(viaCustom.a).toEqual(prev.a);
      expect(viaCustom.b.hex).toBe('#abcdef');
      expect(setLightingDeviceColor).toHaveBeenCalledTimes(1);
    });

    it('names the ids a write may still reach', () => {
      expect(unlockedIds(locked(), ['a', 'b', 'c'])).toEqual(['b', 'c']);
    });

    it('cannot lock a device with no pick', () => {
      const prev = pickCustomForDevices({}, '#112233', ['a'], false);
      expect(setPickLocked(prev, 'zzz', true)).toBe(prev);
    });

    it('round-trips the lock from the service and keeps only locked picks for other modes', () => {
      const restored = devicePicksFromLooks({
        a: { effect: 'flat', color: '#abcdef', hue: 0, saturation: 0, slot: 0, locked: true },
        b: { effect: 'stripes', color: '', hue: 0.5, saturation: 1, slot: 1 },
      } as Parameters<typeof devicePicksFromLooks>[0]);
      expect(restored.a.locked).toBe(true);
      expect(restored.b.locked).toBeUndefined();
      expect(Object.keys(lockedPicks(restored))).toEqual(['a']);
    });
  });
});
