import { describe, expect, it } from 'vitest';
import type { HardwareSensor, SensorState } from '../../../hooks/useSensors';
import { FPS_SENSOR_TEMPLATE, SENSOR_CATEGORIES, sensorsForCategory } from './sensorCategories';

function sensor(partial: Partial<HardwareSensor> & { id: string; name: string; type: string }): HardwareSensor {
  return { value: 0, units: '', formatted: '', parent: { id: '', name: '' }, ...partial };
}

const EMPTY_SENSORS: SensorState = {
  cpu: [], gpu: [], gpuModel: '', gpuComponents: [], memory: [], storage: [], storageComponents: {},
  storageSensors: [], motherboard: [], motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
};

describe('SENSOR_CATEGORIES', () => {
  it('is exactly cpu, gpu, memory, motherboard, storage, network, fps in that order', () => {
    expect(SENSOR_CATEGORIES).toEqual(['cpu', 'gpu', 'memory', 'motherboard', 'storage', 'network', 'fps']);
  });
});

describe('sensorsForCategory', () => {
  it('resolves cpu/gpu/memory/motherboard/storage straight from SensorState', () => {
    const sensors: SensorState = {
      ...EMPTY_SENSORS,
      cpu: [sensor({ id: 'cpu-total', name: 'CPU Total', type: 'Load' })],
      gpu: [sensor({ id: 'gpu-core', name: 'GPU Core', type: 'Load' })],
      memory: [sensor({ id: 'mem-usage', name: 'Memory Usage', type: 'Load' })],
      motherboard: [
        sensor({ id: 'fan-1', name: 'Fan 1', type: 'Fan' }),
        sensor({ id: 'vrm-temp', name: 'VRM Temperature', type: 'Temperature' }),
      ],
      storageSensors: [sensor({ id: 'storage/C/used', name: 'Drive C Used', type: 'Data' })],
    };

    expect(sensorsForCategory('cpu', sensors, [], [])).toEqual(sensors.cpu);
    expect(sensorsForCategory('gpu', sensors, [], [])).toEqual(sensors.gpu);
    expect(sensorsForCategory('memory', sensors, [], [])).toEqual(sensors.memory);
    // Motherboard returns the FULL sensor set, not just Fan-typed ones.
    expect(sensorsForCategory('motherboard', sensors, [], [])).toEqual(sensors.motherboard);
    expect(sensorsForCategory('motherboard', sensors, [], [])).toHaveLength(2);
    expect(sensorsForCategory('storage', sensors, [], [])).toEqual(sensors.storageSensors);
  });

  it('resolves network from the passed-in networkSensors list', () => {
    const networkSensors = [sensor({ id: 'network-total', name: 'Network Total', type: 'Rate' })];
    expect(sensorsForCategory('network', EMPTY_SENSORS, networkSensors, [])).toBe(networkSensors);
  });

  it('resolves fps from live fpsSensors when present', () => {
    const fpsSensors = [sensor({ id: 'fps/current', name: 'FPS', type: 'Framerate', value: 144 })];
    expect(sensorsForCategory('fps', EMPTY_SENSORS, [], fpsSensors)).toBe(fpsSensors);
  });

  it('falls back to FPS_SENSOR_TEMPLATE so FPS + Frame Time always list, even with no live capture', () => {
    expect(sensorsForCategory('fps', EMPTY_SENSORS, [], [])).toBe(FPS_SENSOR_TEMPLATE);
    expect(FPS_SENSOR_TEMPLATE.map(s => s.id)).toEqual(['fps/current', 'fps/frame-time']);
    expect(FPS_SENSOR_TEMPLATE.map(s => s.name)).toEqual(['FPS', 'Frame Time']);
    expect(FPS_SENSOR_TEMPLATE.map(s => s.type)).toEqual(['Framerate', 'FrameTime']);
  });
});
