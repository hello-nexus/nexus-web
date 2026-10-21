import { describe, expect, it } from 'vitest';
import {
  animatePin, colorPin, MIRROR_PIN, paletteColorPin, pickerMarks, pinGridKey, pinHex, pinnedNamesByEffect,
  clearLegacyLightingKeys, pinModeTargetLabel, pinSignature, pinStripPick, pinTargetLabel, pressReach, isPickTarget, selectAllEligible, selectionPin, staticLookPin,
  tabPressChangesNothing, withPins,
} from './pins';
import { defaultStateFor } from '../../../types/lighting';
import { paletteColor, paletteKey } from '../../../types/lightingPalette';

describe('withPins', () => {
  it('sets and clears without touching other devices', () => {
    const a = withPins({ x: animatePin('plasma') }, ['y'], animatePin('aurora'));
    expect(Object.keys(a)).toEqual(['x', 'y']);
    expect(Object.keys(withPins(a, ['x'], null))).toEqual(['y']);
  });

  it('replaces whatever pin a device held', () => {
    const a = withPins({ x: animatePin('plasma') }, ['x'], MIRROR_PIN);
    expect(a.x).toEqual({ kind: 'mirror' });
  });

  it('returns the same object when nothing changes', () => {
    const pin = animatePin('plasma');
    const pins = { x: pin };
    expect(withPins(pins, ['x'], pin)).toBe(pins);
    expect(withPins(pins, ['z'], null)).toBe(pins);
  });
});

describe('pin builders', () => {
  it('a static look pin carries the whole look and its slot', () => {
    const state = { ...defaultStateFor('stripes'), intensity: 0.5, hue: 2, saturation: -1 };
    expect(staticLookPin('stripes', 3, state)).toMatchObject({
      kind: 'static', effect: 'stripes', slot: 3, intensity: 0.5, hue: 1, saturation: 0,
    });
  });

  it('a color pin is a flat fill with the color', () => {
    expect(colorPin('#ff0000')).toMatchObject({ kind: 'static', effect: 'flat', color: '#ff0000', hue: 0, saturation: 1 });
  });

  it('a palette pin carries the swatch hue and saturation', () => {
    const c = paletteColor('red-3')!;
    expect(paletteColorPin(c)).toMatchObject({ effect: 'flat', color: c.hex, hue: c.h, saturation: c.s });
  });

  it('an animate pin carries only the shader, a mirror pin nothing', () => {
    expect(animatePin('aurora')).toEqual({ kind: 'animate', effect: 'aurora' });
    expect(MIRROR_PIN).toEqual({ kind: 'mirror' });
  });
});

describe('selectionPin', () => {
  const pins = { a: animatePin('plasma'), b: animatePin('plasma'), c: animatePin('aurora'), m: MIRROR_PIN };

  it('is none for an empty selection or devices that all follow the global mode', () => {
    expect(selectionPin(pins, [])).toEqual({ kind: 'none' });
    expect(selectionPin(pins, ['x', 'y'])).toEqual({ kind: 'none' });
  });

  it('names the pin every selected device wears', () => {
    expect(selectionPin(pins, ['a', 'b'])).toEqual({ kind: 'pin', pin: animatePin('plasma') });
    expect(selectionPin(pins, ['m'])).toEqual({ kind: 'pin', pin: MIRROR_PIN });
  });

  it('is mixed when pins differ, or a pinned device sits beside a following one', () => {
    expect(selectionPin(pins, ['a', 'c'])).toEqual({ kind: 'mixed' });
    expect(selectionPin(pins, ['a', 'x'])).toEqual({ kind: 'mixed' });
    expect(selectionPin(pins, ['x', 'a'])).toEqual({ kind: 'mixed' });
  });

  // The drawer edits a static pin's (effect, slot), so devices on the same
  // preset share a scope even when their tint snapshots differ.
  it('treats static pins on one effect and preset as one target, whatever their tint', () => {
    const a = { ...staticLookPin('stripes', 1, defaultStateFor('stripes')), intensity: 0.4 };
    const b = { ...staticLookPin('stripes', 1, defaultStateFor('stripes')), intensity: 0.9, hue: 0.5 };
    expect(selectionPin({ a, b }, ['a', 'b'])).toEqual({ kind: 'pin', pin: a });
  });

  it('keeps two flat colors apart and one color together', () => {
    const pins = { a: colorPin('#ff0000'), b: colorPin('#FF0000'), c: colorPin('#00ff00') };
    expect(selectionPin(pins, ['a', 'b']).kind).toBe('pin');
    expect(selectionPin(pins, ['a', 'c']).kind).toBe('mixed');
  });

  it('counts the same effect on two presets as a disagreement', () => {
    const state = defaultStateFor('stripes');
    const two = { a: staticLookPin('stripes', 0, state), b: staticLookPin('stripes', 1, state) };
    expect(selectionPin(two, ['a', 'b'])).toEqual({ kind: 'mixed' });
    expect(pinSignature(two.a)).not.toBe(pinSignature(two.b));
  });
});

describe('grid key and strip pick', () => {
  it('a flat color resolves to its palette swatch, a pattern to its effect', () => {
    const c = paletteColor('red-3')!;
    expect(pinGridKey(paletteColorPin(c))).toBe(paletteKey('red-3'));
    expect(pinGridKey(animatePin('plasma'))).toBe('plasma');
  });

  it('a mirror pin has no strip fallback', () => {
    expect(pinStripPick(MIRROR_PIN)).toBeNull();
    expect(pinStripPick(animatePin('plasma'))).toMatchObject({ key: 'plasma', slot: 0 });
  });

  it('reads a static pin\'s color from the color or the hue', () => {
    expect(pinHex(colorPin('#123456'))).toBe('#123456');
    expect(pinHex({ kind: 'static', effect: 'stripes', hue: 0, saturation: 1 }).toLowerCase()).toBe('#ff0000');
  });
});

describe('pickerMarks', () => {
  const devices = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D', ledsOn: false }, { id: 'e', name: 'E', controlled: false }];
  const pins = { a: colorPin('#ff0000'), b: animatePin('plasma') };

  it('with nothing selected marks every lit, controlled device, flagging the pinned ones', () => {
    expect(pickerMarks(devices, pins, new Set(), '#336699')).toEqual([
      { id: 'a', name: 'A', hex: '#ff0000', pinned: true },
      { id: 'b', name: 'B', hex: '', pinned: true },
      { id: 'c', name: 'C', hex: '#336699', pinned: false },
    ]);
  });

  it('marks a selection on what each wears, with no color for a non-static pin, still flagging pins', () => {
    const marks = pickerMarks(devices, pins, new Set(['a', 'b', 'c']), '#336699');
    expect(marks.map(d => d.hex)).toEqual(['#ff0000', '', '#336699']);
    expect(marks.map(d => d.pinned)).toEqual([true, true, false]);
  });

  it('names a mark as the canvas names its frame', () => {
    const zones = [
      { id: 'z', name: 'B850I AORUS PRO - ARGB_V2_1' },
      { id: 'r', name: 'Front - intake', originalName: 'B850I AORUS PRO - ARGB_V2_2' },
    ];
    expect(pickerMarks(zones, {}, new Set(), '#336699').map(d => d.name)).toEqual(['ARGB_V2_1', 'Front - intake']);
  });
});

describe('pinnedNamesByEffect', () => {
  const pins = {
    a: animatePin('plasma'), b: animatePin('plasma'), c: animatePin('aurora'),
    d: { kind: 'static' as const, effect: 'stripes' }, e: colorPin('#ff0000'), m: MIRROR_PIN,
  };
  const names: Record<string, string> = { a: 'Fan A', b: 'Fan B', c: 'Strip', d: 'Hub', e: 'Pump' };

  it('lists animate pins by shader, with device names', () => {
    const m = pinnedNamesByEffect(pins, 'animate', id => names[id]);
    expect(m.get('plasma')).toEqual(['Fan A', 'Fan B']);
    expect(m.get('aurora')).toEqual(['Strip']);
    expect(m.has('stripes')).toBe(false);
  });

  it('lists static pattern pins, leaving flat colors to the palette', () => {
    const m = pinnedNamesByEffect(pins, 'static', id => names[id]);
    expect([...m.keys()]).toEqual(['stripes']);
  });

  it('drops devices it has no name for', () => {
    const m = pinnedNamesByEffect(pins, 'animate', id => (id === 'a' ? 'Fan A' : undefined));
    expect(m.get('plasma')).toEqual(['Fan A']);
    expect(m.has('aurora')).toBe(false);
  });
});

describe('pinModeTargetLabel', () => {
  const t = (key: string, params?: Record<string, string>) => (params ? `${params.mode}: ${params.name}` : key);

  it('names a static or animate pin by mode and target, Mirror and Media by mode alone', () => {
    expect(pinModeTargetLabel(paletteColorPin(paletteColor('red-3')!), t)).toBe('lighting.mode.static: lighting.palette.red 3');
    expect(pinModeTargetLabel(animatePin('plasma'), t)).toBe('lighting.mode.animate: lighting.controls.plasma');
    expect(pinModeTargetLabel(MIRROR_PIN, t)).toBe('lighting.mode.screen');
    expect(pinModeTargetLabel({ kind: 'animate', effect: '' }, t)).toBe('lighting.mode.animate');
  });
});

describe('pressReach', () => {
  const devices = [{ id: 'a' }, { id: 'b' }, { id: 'c', ledsOn: false }, { id: 'd', controlled: false }];
  const pins = { a: animatePin('plasma') };

  it('reaches the unpinned lit, controlled cards, the selection once there is one, every lit card when pins are overridden', () => {
    expect([...pressReach(devices, pins, new Set())]).toEqual(['b']);
    expect([...pressReach(devices, pins, new Set(['a', 'c']))]).toEqual(['a']);
    expect([...pressReach(devices, pins, new Set(['a']), true)]).toEqual(['a', 'b']);
  });

  it('skips cards set on their device page', () => {
    const list = [{ id: 'a' }, { id: 'p', devicePageReason: 'firmware' }];
    expect([...pressReach(list, {}, new Set())]).toEqual(['a']);
    expect([...pressReach(list, {}, new Set(['p']))]).toEqual([]);
    expect([...pressReach(list, {}, new Set(), true)]).toEqual(['a']);
    expect(isPickTarget(list[1], {}, new Set())).toBe(false);
    expect(selectAllEligible(list[1])).toBe(false);
    expect(selectAllEligible(list[0])).toBe(true);
  });

  it('knows when a press on the tab already showing changes nothing', () => {
    expect(tabPressChangesNothing('static', 'static', 0, false)).toBe(true);
    expect(tabPressChangesNothing('static', 'static', 1, false)).toBe(false);
    expect(tabPressChangesNothing('static', 'static', 1, true)).toBe(true);
    expect(tabPressChangesNothing('animate', 'static', 0, false)).toBe(false);
  });
});

describe('pinTargetLabel', () => {
  const t = (key: string) => key;

  it('names a palette swatch by family and shade, and an off-palette color by hex', () => {
    const c = paletteColor('red-3')!;
    expect(pinTargetLabel(paletteColorPin(c), t)).toBe('lighting.palette.red 3');
    expect(pinTargetLabel(colorPin('#010203'), t)).toMatch(/^#010203$|^lighting\.palette\./);
  });

  it('names a simple sweep by its own label, a shader by its effect label, and Mirror', () => {
    expect(pinTargetLabel(animatePin('sweeprainbow'), t)).toBe('lighting.simple.anim.rainbow');
    expect(pinTargetLabel(animatePin('plasma'), t)).toBe('lighting.controls.plasma');
    expect(pinTargetLabel(MIRROR_PIN, t)).toBe('lighting.mode.screen');
  });
});

describe('clearLegacyLightingKeys', () => {
  it('removes the keys of the per-device-pick model and keeps the stored selection', () => {
    for (const k of ['nexus.lighting.selectedDevices', 'nexus.lighting.devicePicks', 'nexus.lighting.selectionSeeded', 'nexus.lighting.pinSelection']) {
      localStorage.setItem(k, '1');
    }
    localStorage.setItem('nexus.lighting.customColor', '"#fff"');
    clearLegacyLightingKeys();
    expect(localStorage.getItem('nexus.lighting.selectedDevices')).toBeNull();
    expect(localStorage.getItem('nexus.lighting.pinSelection')).toBe('1');
    expect(localStorage.getItem('nexus.lighting.customColor')).toBe('"#fff"');
  });
});
