// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { HardwareSensor } from '../hooks/useSensors';
import { gpuTag, gpuTagForSensor, resolvePrimaryGpu, type GpuComponent } from './gpuResolver';

function sensor(id: string, name: string): HardwareSensor {
  return { id, name, type: 'Temperature', value: 0, units: '°C', formatted: '', parent: { id: '', name: '' } };
}

const dgpu: GpuComponent = { id: '/gpu-nvidia/0', name: 'NVIDIA GeForce RTX 5080', integrated: false, sensors: [sensor('/gpu-nvidia/0/temperature/0', 'GPU Core')] };
const igpu: GpuComponent = { id: '/gpu-amd/0', name: 'AMD Radeon(TM) Graphics', integrated: true, sensors: [sensor('/gpu-amd/0/temperature/0', 'GPU Core')] };
const dgpu2: GpuComponent = { id: '/gpu-nvidia/1', name: 'NVIDIA GeForce RTX 4070', integrated: false, sensors: [sensor('/gpu-nvidia/1/temperature/0', 'GPU Core')] };

describe('resolvePrimaryGpu', () => {
  it('prefers the first discrete GPU with no preference set', () => {
    expect(resolvePrimaryGpu([igpu, dgpu], '')).toBe(dgpu);
  });
});

describe('gpuTag', () => {
  it('is plain "GPU" on a single-GPU box (even an iGPU-only one) and for an unknown id', () => {
    expect(gpuTag([dgpu], dgpu.id)).toBe('GPU');
    expect(gpuTag([igpu], igpu.id)).toBe('GPU');
    expect(gpuTag([dgpu, igpu], '/gpu-intel/0')).toBe('GPU');
  });

  it('tells an iGPU from the discrete card without numbering either', () => {
    expect(gpuTag([igpu, dgpu], dgpu.id)).toBe('GPU');
    expect(gpuTag([igpu, dgpu], igpu.id)).toBe('iGPU');
  });

  it('numbers only a second card of the same kind, in broadcast order', () => {
    expect(gpuTag([dgpu, dgpu2, igpu], dgpu.id)).toBe('GPU');
    expect(gpuTag([dgpu, dgpu2, igpu], dgpu2.id)).toBe('GPU 2');
    expect(gpuTag([dgpu, dgpu2, igpu], igpu.id)).toBe('iGPU');
  });

  it('does not move with the primary-GPU preference', () => {
    // The preference changes which card is primary, never which tag a card carries.
    expect(resolvePrimaryGpu([igpu, dgpu], igpu.name)).toBe(igpu);
    expect(gpuTag([igpu, dgpu], igpu.id)).toBe('iGPU');
  });
});

describe('gpuTagForSensor', () => {
  it('tags by the GPU that owns the sensor id', () => {
    expect(gpuTagForSensor([igpu, dgpu], '/gpu-amd/0/temperature/0')).toBe('iGPU');
    expect(gpuTagForSensor([igpu, dgpu], '/gpu-nvidia/0/temperature/0')).toBe('GPU');
  });

  it('falls back to "GPU" for an id no GPU lists (Linux hwmon cooling sources)', () => {
    expect(gpuTagForSensor([igpu, dgpu], 'hwmon/hwmon3/temp1')).toBe('GPU');
  });
});
