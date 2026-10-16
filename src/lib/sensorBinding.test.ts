import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SENSOR_BINDING, effectiveBinding, isSensorBinding, normalizeSensor, parseSensorUniforms,
  sensorAnnotationJson, sensorBindingsEqual, sensorOverridesEqual, sensorSweep, smoothSensor,
} from './sensorBinding';

const cpu = { category: 'quick', sensor: 'summary/cpu-usage', min: 0, max: 100 };

describe('isSensorBinding', () => {
  it('accepts a well-formed binding', () => {
    expect(isSensorBinding(cpu)).toBe(true);
    expect(isSensorBinding({ category: 'cpu', sensor: '/intelcpu/0/temperature/0', min: 30, max: 95 })).toBe(true);
  });

  it('accepts any non-empty id the service does, such as a macOS mount path', () => {
    for (const sensor of ["/Volumes/Bob's [Backup] & Co/temp\u00e9", 'a"b', 'line\nbreak', '/x'.repeat(100)]) {
      expect(isSensorBinding({ ...cpu, sensor }), sensor).toBe(true);
    }
    expect(isSensorBinding({ ...cpu, sensor: '' })).toBe(false);
    expect(isSensorBinding({ ...cpu, sensor: 'x'.repeat(513) })).toBe(false);
  });

  it('rejects a missing field, an empty or inverted range, and a malformed category', () => {
    expect(isSensorBinding(null)).toBe(false);
    expect(isSensorBinding({ ...cpu, sensor: undefined })).toBe(false);
    expect(isSensorBinding({ ...cpu, min: 50, max: 50 })).toBe(false);
    expect(isSensorBinding({ ...cpu, min: 90, max: 10 })).toBe(false);
    expect(isSensorBinding({ ...cpu, max: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isSensorBinding({ ...cpu, category: 'not a category' })).toBe(false);
  });
});

describe('sensor annotation', () => {
  it('round-trips through a declared uniform line, in the contract field order', () => {
    const json = sensorAnnotationJson({ max: 100, min: 0, sensor: 'summary/cpu-usage', category: 'quick' });
    expect(json).toBe('{"category":"quick","sensor":"summary/cpu-usage","min":0,"max":100}');
    const frag = ['uniform float u_a;', `uniform float u_b_level_s; // sensor ${json}`, 'void main() {}'].join('\n');
    expect(parseSensorUniforms(frag)).toEqual([{ name: 'u_b_level_s', binding: cpu }]);
  });

  it('keeps a baked frag ASCII by escaping other characters', () => {
    const json = sensorAnnotationJson({ category: 'quick', sensor: 'Température', min: 0, max: 1 });
    expect(/^[\x20-\x7e]*$/.test(json)).toBe(true);
    expect(JSON.parse(json).sensor).toBe('Température');
  });

  it('round-trips an id with quotes, brackets, newlines and non-ASCII text on one ASCII line', () => {
    const sensor = "/Volumes/Bob's \"[Backup]\" & Co\n/Tem\u00e9ratur \u{1F600}";
    const json = sensorAnnotationJson({ category: 'storage', sensor, min: 0, max: 1 });
    expect(/^[\x20-\x7e]*$/.test(json)).toBe(true);
    const frag = `uniform float u_a_level_s; // sensor ${json}`;
    expect(parseSensorUniforms(frag)).toEqual([{ name: 'u_a_level_s', binding: { category: 'storage', sensor, min: 0, max: 1 } }]);
  });

  it('ignores a malformed or invalid annotation and any uniform without one', () => {
    const frag = [
      'uniform float u_x; // hint_range(0.0, 1.0, 0.01) = 0.5',
      'uniform float u_y_s; // sensor {not json}',
      'uniform float u_z_s; // sensor {"category":"quick","sensor":"a","min":5,"max":1}',
    ].join('\n');
    expect(parseSensorUniforms(frag)).toEqual([]);
  });
});

describe('overrides', () => {
  const uniform = { name: 'u_a_level_s', binding: cpu };

  it('renders the shader default unless the user override is valid', () => {
    expect(effectiveBinding(uniform, undefined)).toBe(cpu);
    expect(effectiveBinding(uniform, { u_other: { ...cpu, sensor: 'x' } })).toBe(cpu);
    const mine = { category: 'cpu', sensor: 'cpu-total', min: 0, max: 80 };
    expect(effectiveBinding(uniform, { u_a_level_s: mine })).toBe(mine);
    expect(effectiveBinding(uniform, { u_a_level_s: { ...mine, min: 90 } })).toBe(cpu);
  });

  it('treats an absent map as an empty one', () => {
    expect(sensorOverridesEqual(undefined, {})).toBe(true);
    expect(sensorOverridesEqual({ a: cpu }, undefined)).toBe(false);
    expect(sensorOverridesEqual({ a: cpu }, { a: { ...cpu } })).toBe(true);
    expect(sensorOverridesEqual({ a: cpu }, { a: { ...cpu, max: 90 } })).toBe(false);
    expect(sensorBindingsEqual(cpu, DEFAULT_SENSOR_BINDING)).toBe(true);
  });
});

describe('signal math', () => {
  it('maps the range to 0..1, clamps, and reads a missing reading as 0', () => {
    expect(normalizeSensor(50, 0, 100)).toBe(0.5);
    expect(normalizeSensor(30, 30, 90)).toBe(0);
    expect(normalizeSensor(120, 0, 100)).toBe(1);
    expect(normalizeSensor(-5, 0, 100)).toBe(0);
    expect(normalizeSensor(Number.NaN, 0, 100)).toBe(0);
    expect(normalizeSensor(5, 10, 10)).toBe(0);
  });

  it('swings the stand-in over its whole range', () => {
    const samples = Array.from({ length: 81 }, (_, i) => sensorSweep(i / 10));
    expect(Math.min(...samples)).toBeCloseTo(0, 5);
    expect(Math.max(...samples)).toBeCloseTo(1, 5);
  });

  it('glides toward the target without overshooting', () => {
    let v = 0;
    for (let i = 0; i < 10; i++) {
      const next = smoothSensor(v, 1, 0.1);
      expect(next).toBeGreaterThan(v);
      expect(next).toBeLessThan(1);
      v = next;
    }
  });
});
