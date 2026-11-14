import { describe, expect, it } from 'vitest';
import { BASE_DEFAULTS, type EffectState } from './lighting';
import { mergeTemplates, slotMatchesDefault } from './lightingTemplates';

const binding = { category: 'quick', sensor: 'summary/cpu-usage', min: 0, max: 100 };
const slot = (sensors?: EffectState['sensors']): EffectState => ({ ...BASE_DEFAULTS, params: { u_a: 1 }, sensors });
const defaults = { sensorbar: { selected: 0, slots: [slot(), slot(), slot(), slot()] } };

describe('slotMatchesDefault with sensor picks', () => {
  it('treats no picks and an empty map alike, and any pick as a change', () => {
    expect(slotMatchesDefault('sensorbar', 0, slot(), defaults)).toBe(true);
    expect(slotMatchesDefault('sensorbar', 0, slot({}), defaults)).toBe(true);
    expect(slotMatchesDefault('sensorbar', 0, slot({ u_a_s: binding }), defaults)).toBe(false);
    expect(slotMatchesDefault('sensorbar', 0, slot({ u_a_s: { ...binding, max: 80 } }), {
      sensorbar: { selected: 0, slots: [slot({ u_a_s: binding })] },
    })).toBe(false);
  });
});

describe('mergeTemplates with sensor picks', () => {
  it('keeps each preset slot its own picks', () => {
    const merged = mergeTemplates('sensorbar', {
      selected: 1,
      slots: [slot({ u_a_s: binding }), slot({ u_a_s: { ...binding, sensor: 'summary/cpu-temp' } })],
    }, defaults);
    expect(merged.slots[0].sensors).toEqual({ u_a_s: binding });
    expect(merged.slots[1].sensors?.u_a_s.sensor).toBe('summary/cpu-temp');
    expect(merged.slots[2].sensors).toBeUndefined();
  });
});

describe('mergeTemplates with a slot stored before the fill background', () => {
  it('takes the preset background for the missing keys, so an untouched slot still matches its default', () => {
    const preset = (i: number): EffectState => ({ ...BASE_DEFAULTS, hue: i / 4, params: { u_fill_angle: 0, u_fill_bgHue: 0.61, u_fill_bgSat: 0.3, u_fill_bgVal: 0.1 } });
    const shipped = { sensorbar: { selected: 0, slots: [preset(0), preset(1), preset(2), preset(3)] } };
    // A dense selected slot written before the background keys existed.
    const stored: EffectState = { ...preset(1), params: { u_fill_angle: 0 } };
    const merged = mergeTemplates('sensorbar', { selected: 1, slots: [null as unknown as EffectState, stored] }, shipped);
    expect(merged.slots[1].params).toEqual(preset(1).params);
    expect(slotMatchesDefault('sensorbar', 1, merged.slots[1], shipped)).toBe(true);
    // An edited slot keeps its edit and still gains the preset background.
    const edited = mergeTemplates('sensorbar', { selected: 1, slots: [null as unknown as EffectState, { ...stored, params: { u_fill_angle: 90 } }] }, shipped);
    expect(edited.slots[1].params).toEqual({ ...preset(1).params, u_fill_angle: 90 });
  });
});
