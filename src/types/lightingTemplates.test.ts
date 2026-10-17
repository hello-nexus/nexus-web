import { describe, expect, it } from 'vitest';
import { BASE_DEFAULTS, type EffectState } from './lighting';
import { mergeTemplates, slotMatchesDefault, wheelSeededBundle } from './lightingTemplates';

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

describe('wheelSeededBundle', () => {
  it('opens every slot on the authored wheel, or neutral without one', () => {
    const seeded = wheelSeededBundle('custom:a', { hue: 0.31, colorize: 0.38 });
    expect(seeded.slots).toHaveLength(4);
    expect(seeded.slots.every(s => s.hue === 0.31 && s.colorize === 0.38 && s.speed === BASE_DEFAULTS.speed)).toBe(true);
    expect(wheelSeededBundle('custom:a', null).slots[0]).toMatchObject({ hue: 0, colorize: 0 });
  });
});
