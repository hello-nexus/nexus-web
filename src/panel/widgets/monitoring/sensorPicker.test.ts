// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { HardwareSensor, SensorState } from '../../../hooks/useSensors';
import { EMPTY_SENSOR_EXTRAS } from '../../../hooks/useSensorExtras';
import { DEVICE_OPTION_KEYS, sensorsForDevice, visibleDeviceKeys } from './sensorPicker';

function sensor(partial: Partial<HardwareSensor> & { id: string; name: string; type: string }): HardwareSensor {
  return { value: 0, units: '', formatted: '', parent: { id: '', name: '' }, ...partial };
}

const EMPTY_SENSORS: SensorState = {
  summary: [], cpu: [], gpu: [], gpuModel: '', gpuComponents: [], memory: [], storage: [], storageComponents: {},
  storageSensors: [], motherboard: [], motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
};

describe('igpu picker category', () => {
  const dCore = sensor({ id: '/gpu-nvidia/0/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const iCore = sensor({ id: '/gpu-amd/0/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const iSoc = sensor({ id: '/gpu-amd/0/temperature/1', name: 'GPU VR SoC', type: 'Temperature' });
  const igpu = { id: '/gpu-amd/0', name: 'AMD Radeon(TM) Graphics', integrated: true, sensors: [iCore, iSoc] };
  const dgpu = { id: '/gpu-nvidia/0', name: 'NVIDIA GeForce RTX 5080', integrated: false, sensors: [dCore] };
  const dual: SensorState = { ...EMPTY_SENSORS, gpu: dgpu.sensors, gpuComponents: [igpu, dgpu] };
  const single: SensorState = { ...EMPTY_SENSORS, gpu: dgpu.sensors, gpuComponents: [dgpu] };

  it('sits right after gpu2 in the device order', () => {
    expect(DEVICE_OPTION_KEYS.indexOf('igpu')).toBe(DEVICE_OPTION_KEYS.indexOf('gpu2') + 1);
  });

  it('lists the integrated card\'s sensors with bare names, untagged, beside an unchanged gpu list', () => {
    expect(sensorsForDevice(dual, [], EMPTY_SENSOR_EXTRAS, 'igpu').map(o => o.label))
      .toEqual(['Core (Temperature)', 'VR SoC (Temperature)']);
    expect(sensorsForDevice(dual, [], EMPTY_SENSOR_EXTRAS, 'gpu').map(o => o.value)).toEqual([dCore.id]);
  });

  it('is offered only when an integrated card sits beside the primary', () => {
    expect(visibleDeviceKeys(DEVICE_OPTION_KEYS, 'cpu', dual, [], EMPTY_SENSOR_EXTRAS)).toContain('igpu');
    expect(visibleDeviceKeys(DEVICE_OPTION_KEYS, 'cpu', single, [], EMPTY_SENSOR_EXTRAS)).not.toContain('igpu');
  });
});

describe('gpu2 picker category', () => {
  const aCore = sensor({ id: '/gpu-nvidia/0/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const bCore = sensor({ id: '/gpu-nvidia/1/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const bHot = sensor({ id: '/gpu-nvidia/1/temperature/1', name: 'GPU Hot Spot', type: 'Temperature' });
  const cardA = { id: '/gpu-nvidia/0', name: 'NVIDIA GeForce RTX 5080', integrated: false, sensors: [aCore] };
  const cardB = { id: '/gpu-nvidia/1', name: 'NVIDIA GeForce RTX 4070', integrated: false, sensors: [bCore, bHot] };
  const dual: SensorState = { ...EMPTY_SENSORS, gpu: cardA.sensors, gpuComponents: [cardA, cardB] };
  const single: SensorState = { ...EMPTY_SENSORS, gpu: cardA.sensors, gpuComponents: [cardA] };

  it('sits between gpu and igpu in the device order', () => {
    expect(DEVICE_OPTION_KEYS.slice(DEVICE_OPTION_KEYS.indexOf('gpu'), DEVICE_OPTION_KEYS.indexOf('gpu') + 3)).toEqual(['gpu', 'gpu2', 'igpu']);
  });

  it('lists the second card\'s sensors with bare names beside an unchanged gpu list', () => {
    expect(sensorsForDevice(dual, [], EMPTY_SENSOR_EXTRAS, 'gpu2').map(o => o.label))
      .toEqual(['Core (Temperature)', 'Hot Spot (Temperature)']);
    expect(sensorsForDevice(dual, [], EMPTY_SENSOR_EXTRAS, 'gpu').map(o => o.value)).toEqual([aCore.id]);
  });

  it('is offered only with a second discrete card', () => {
    expect(visibleDeviceKeys(DEVICE_OPTION_KEYS, 'cpu', dual, [], EMPTY_SENSOR_EXTRAS)).toContain('gpu2');
    expect(visibleDeviceKeys(DEVICE_OPTION_KEYS, 'cpu', single, [], EMPTY_SENSOR_EXTRAS)).not.toContain('gpu2');
  });
});
