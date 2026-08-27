// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { HardwareSensor } from '../../../../hooks/useSensors';
import { formatTabChipValue, tabChipLoadPercent } from './tabChipValue';

function sensor(partial: Partial<HardwareSensor> & { name: string; type: string; value: number }): HardwareSensor {
  return { id: partial.name, units: '%', formatted: `${partial.value}%`, parent: { id: 'x', name: 'x' }, ...partial };
}

describe('tabChipLoadPercent', () => {
  it('reads CPU Total for the cpu tab', () => {
    const cpu = [sensor({ name: 'CPU Total', type: 'Load', value: 42 })];
    expect(tabChipLoadPercent('cpu', cpu, [], [])).toBe(42);
  });

  it('reads Memory Usage for the memory tab (Mac/Linux providers)', () => {
    const memory = [sensor({ name: 'Memory Usage', type: 'Load', value: 63 })];
    expect(tabChipLoadPercent('memory', [], [], memory)).toBe(63);
  });

  it('matches any Load-typed memory sensor regardless of name (Windows LHM names its RAM sensor "Memory", not "Memory Usage")', () => {
    const memory = [sensor({ name: 'Memory', type: 'Load', value: 71 })];
    expect(tabChipLoadPercent('memory', [], [], memory)).toBe(71);
  });

  it('reads the GPU Core Load sensor for the gpu tab', () => {
    const gpu = [sensor({ name: 'GPU Core', type: 'Load', value: 30 })];
    expect(tabChipLoadPercent('gpu', [], gpu, [])).toBe(30);
  });

  it('matches a D3D-prefixed load sensor as the GPU fallback (no discrete GPU Core reading)', () => {
    const gpu = [sensor({ name: 'D3D 3D', type: 'Load', value: 18 })];
    expect(tabChipLoadPercent('gpu', [], gpu, [])).toBe(18);
  });

  it('defaults to 0 when the expected sensor is absent', () => {
    expect(tabChipLoadPercent('cpu', [], [], [])).toBe(0);
    expect(tabChipLoadPercent('gpu', [], [], [])).toBe(0);
    expect(tabChipLoadPercent('memory', [], [], [])).toBe(0);
  });
});

describe('formatTabChipValue', () => {
  const cpu = [sensor({ name: 'CPU Total', type: 'Load', value: 42.6 })];
  const gpu = [sensor({ name: 'GPU Core', type: 'Load', value: 30 })];
  const memory = [sensor({ name: 'Memory Usage', type: 'Load', value: 63.2 })];

  it('rounds and appends a percent sign for cpu/gpu/memory', () => {
    expect(formatTabChipValue('cpu', cpu, gpu, memory, 0, 0, 'system')).toBe('43%');
    expect(formatTabChipValue('gpu', cpu, gpu, memory, 0, 0, 'system')).toBe('30%');
    expect(formatTabChipValue('memory', cpu, gpu, memory, 0, 0, 'system')).toBe('63%');
  });

  it('formats network as a rate, independent of the load sensors', () => {
    expect(formatTabChipValue('network', cpu, gpu, memory, 500, 0, 'system')).toBe('500 B/s');
    expect(formatTabChipValue('network', cpu, gpu, memory, 2 * 1024 * 1024, 0, 'system')).toBe('2.0 MB/s');
  });

  it('formats storage as a rate, independent of the load sensors and the network rate', () => {
    expect(formatTabChipValue('storage', cpu, gpu, memory, 2 * 1024 * 1024, 500, 'system')).toBe('500 B/s');
    expect(formatTabChipValue('storage', cpu, gpu, memory, 0, 2 * 1024 * 1024, 'system')).toBe('2.0 MB/s');
  });
});
