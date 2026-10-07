import { describe, expect, it } from 'vitest';
import { sensorGlobMatch } from '../host';

describe('sensorGlobMatch (sensors.read grants and subscriptions)', () => {
  it('lets a trailing wildcard match any flattened id under the family', () => {
    expect(sensorGlobMatch('cpu.*', 'cpu.intelcpu.0.temperature.0')).toBe(true);
    expect(sensorGlobMatch('cpu.*', 'cpu.amdcpu.0.load.1')).toBe(true);
    expect(sensorGlobMatch('cpu.*', 'gpu.nvidia.0.temperature.0')).toBe(false);
    expect(sensorGlobMatch('cpu.*', 'cpux.intelcpu.0')).toBe(false);
  });

  it('keeps every other character literal', () => {
    expect(sensorGlobMatch('cpu.load', 'cpu.load')).toBe(true);
    expect(sensorGlobMatch('cpu.load', 'cpuxload')).toBe(false);
    expect(sensorGlobMatch('cpu.load', 'cpu.load.0')).toBe(false);
    expect(sensorGlobMatch('a+b', 'aab')).toBe(false);
    expect(sensorGlobMatch('a+b', 'a+b')).toBe(true);
    expect(sensorGlobMatch('(x)', 'x')).toBe(false);
    expect(sensorGlobMatch('(x)', '(x)')).toBe(true);
    expect(sensorGlobMatch('[ab]?', 'a')).toBe(false);
  });

  it('allows wildcards anywhere and ignores case', () => {
    expect(sensorGlobMatch('Storage.*.Temperature.*', 'storage.nvme0.temperature.0')).toBe(true);
    expect(sensorGlobMatch('storage.*.temperature.*', 'storage.nvme0.load.0')).toBe(false);
    expect(sensorGlobMatch('*', 'anything')).toBe(true);
    expect(sensorGlobMatch('*.temperature.0', 'cpu.intelcpu.0.temperature.0')).toBe(true);
  });

  it('stays fast on a many-wildcard pattern and ignores over-long ones', () => {
    const id = 'cpu.intelcpu.0.temperature.0.aaaaaaaaaaaa';
    const started = performance.now();
    expect(sensorGlobMatch(`${'*a'.repeat(12)}*z`, id)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
    expect(sensorGlobMatch(`cpu.${'*'.repeat(200)}`, 'cpu.x')).toBe(false);
  });
});
