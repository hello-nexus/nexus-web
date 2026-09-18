// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { HardwareSensor, SensorState } from '../../../hooks/useSensors';
import type { SensorExtras } from '../../../hooks/useSensorExtras';
import { EMPTY_SENSOR_EXTRAS } from '../../../hooks/useSensorExtras';
import { extrasSensorsForDevice, FPS_SENSOR_TEMPLATE, gpu2Components, gpu2Sensors, igpuComponents, igpuSensors, SENSOR_CATEGORIES, sensorsForCategory, smartStorageSensors } from './sensorCategories';

function sensor(partial: Partial<HardwareSensor> & { id: string; name: string; type: string }): HardwareSensor {
  return { value: 0, units: '', formatted: '', parent: { id: '', name: '' }, ...partial };
}

const EMPTY_SENSORS: SensorState = {
  summary: [], cpu: [], gpu: [], gpuModel: '', gpuComponents: [], memory: [], storage: [], storageComponents: {},
  storageSensors: [], motherboard: [], motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
};

describe('SENSOR_CATEGORIES', () => {
  it('is exactly quick, cpu, gpu, memory, motherboard, storage, network, fps in that order', () => {
    expect(SENSOR_CATEGORIES).toEqual(['quick', 'cpu', 'gpu', 'memory', 'motherboard', 'storage', 'network', 'fps']);
  });
});

describe('sensorsForCategory', () => {
  it('resolves quick/cpu/gpu/memory/motherboard/storage straight from SensorState', () => {
    const sensors: SensorState = {
      ...EMPTY_SENSORS,
      summary: [sensor({ id: 'summary/cpu-temp', name: 'CPU Temperature', type: 'Temperature' })],
      cpu: [sensor({ id: 'cpu-total', name: 'CPU Total', type: 'Load' })],
      gpu: [sensor({ id: 'gpu-core', name: 'GPU Core', type: 'Load' })],
      memory: [sensor({ id: 'mem-usage', name: 'Memory Usage', type: 'Load' })],
      motherboard: [
        sensor({ id: 'fan-1', name: 'Fan 1', type: 'Fan' }),
        sensor({ id: 'vrm-temp', name: 'VRM Temperature', type: 'Temperature' }),
      ],
      storageSensors: [sensor({ id: 'storage/C/used', name: 'Drive C Used', type: 'Data' })],
    };

    expect(sensorsForCategory('quick', sensors, [], [])).toEqual(sensors.summary);
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

// smartStorageSensors and extrasSensorsForDevice are widget-only: neither is
// part of sensorsForCategory/SENSOR_CATEGORIES, so the Tryx overlay picker
// (which mirrors SENSOR_CATEGORIES exactly) can never resolve them.
describe('smartStorageSensors', () => {
  it('flattens sensors from smart/*-keyed storage components only', () => {
    const sensors: SensorState = {
      ...EMPTY_SENSORS,
      storageComponents: {
        C: { id: 'C', name: 'Drive C', capacity: '1 TB', freeSpace: '500 GB', usedSpace: '500 GB', usedPercentage: '50' },
        'smart/nvme/0': {
          id: 'smart/nvme/0', name: 'Test NVMe', capacity: '', freeSpace: '', usedSpace: '', usedPercentage: '',
          sensors: [sensor({ id: '/nvme/0/temperature/0', name: 'Composite Temperature', type: 'Temperature' })],
        },
      },
    };
    expect(smartStorageSensors(sensors).map(s => s.id)).toEqual(['/nvme/0/temperature/0']);
  });

  it('returns an empty array when no smart/* component is present', () => {
    expect(smartStorageSensors(EMPTY_SENSORS)).toEqual([]);
  });
});

describe('extrasSensorsForDevice', () => {
  const extras: SensorExtras = {
    ...EMPTY_SENSOR_EXTRAS,
    memoryModules: [{ id: '/memory/dimm/0', name: 'DIMM 0', sensors: [sensor({ id: 'dimm-temp', name: 'DIMM #0', type: 'Temperature' })] }],
    batteries: [{ id: 'battery/0', name: 'Battery', sensors: [sensor({ id: 'battery-charge', name: 'Charge Level', type: 'Level' })] }],
  };

  it('resolves each extras-topic device to its own flattened sensor list', () => {
    expect(extrasSensorsForDevice('memoryModule', extras).map(s => s.id)).toEqual(['dimm-temp']);
    expect(extrasSensorsForDevice('battery', extras).map(s => s.id)).toEqual(['battery-charge']);
    expect(extrasSensorsForDevice('cooler', extras)).toEqual([]);
    expect(extrasSensorsForDevice('psu', extras)).toEqual([]);
    expect(extrasSensorsForDevice('embeddedController', extras)).toEqual([]);
  });

  it('returns an empty array for a non-extras device', () => {
    expect(extrasSensorsForDevice('cpu', extras)).toEqual([]);
    expect(extrasSensorsForDevice('smart', extras)).toEqual([]);
  });
});

describe('igpuComponents / igpuSensors', () => {
  const dCore = sensor({ id: '/gpu-nvidia/0/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const iCore = sensor({ id: '/gpu-amd/0/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const iSoc = sensor({ id: '/gpu-amd/0/temperature/1', name: 'GPU VR SoC', type: 'Temperature' });
  const igpu = { id: '/gpu-amd/0', name: 'AMD Radeon(TM) Graphics', integrated: true, sensors: [iCore, iSoc] };
  const dgpu = { id: '/gpu-nvidia/0', name: 'NVIDIA GeForce RTX 5080', integrated: false, sensors: [dCore] };

  it('is the integrated card beside a discrete primary, and the gpu category stays the primary alone', () => {
    const sensors: SensorState = { ...EMPTY_SENSORS, gpu: dgpu.sensors, gpuComponents: [igpu, dgpu] };
    expect(igpuComponents(sensors)).toEqual([igpu]);
    expect(igpuSensors(sensors).map(s => s.id)).toEqual([iCore.id, iSoc.id]);
    expect(sensorsForCategory('gpu', sensors, [], [])).toBe(dgpu.sensors);
  });

  it('is empty on an iGPU-only box, where the gpu category already is the iGPU', () => {
    expect(igpuComponents({ ...EMPTY_SENSORS, gpu: igpu.sensors, gpuComponents: [igpu] })).toEqual([]);
  });

  it('still lists the iGPU when it is picked as the preferred (primary) GPU, so igpu slots keep resolving', () => {
    expect(igpuComponents({ ...EMPTY_SENSORS, gpu: igpu.sensors, gpuComponents: [igpu, dgpu] })).toEqual([igpu]);
  });

  it('is empty on a discrete-only box', () => {
    expect(igpuComponents({ ...EMPTY_SENSORS, gpu: dgpu.sensors, gpuComponents: [dgpu] })).toEqual([]);
  });
});

describe('gpu2Components / gpu2Sensors', () => {
  const aCore = sensor({ id: '/gpu-nvidia/0/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const bCore = sensor({ id: '/gpu-nvidia/1/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const bHot = sensor({ id: '/gpu-nvidia/1/temperature/1', name: 'GPU Hot Spot', type: 'Temperature' });
  const iCore = sensor({ id: '/gpu-amd/0/temperature/0', name: 'GPU Core', type: 'Temperature' });
  // Two identical cards: only the sensor ids tell them apart.
  const cardA = { id: '/gpu-nvidia/0', name: 'NVIDIA GeForce RTX 5080', integrated: false, sensors: [aCore] };
  const cardB = { id: '/gpu-nvidia/1', name: 'NVIDIA GeForce RTX 5080', integrated: false, sensors: [bCore, bHot] };
  const igpu = { id: '/gpu-amd/0', name: 'AMD Radeon(TM) Graphics', integrated: true, sensors: [iCore] };

  it('is every discrete card but the primary, split by sensor id even when the names match', () => {
    const sensors: SensorState = { ...EMPTY_SENSORS, gpu: cardA.sensors, gpuComponents: [cardA, cardB, igpu] };
    expect(gpu2Components(sensors)).toEqual([cardB]);
    expect(gpu2Sensors(sensors).map(s => s.id)).toEqual([bCore.id, bHot.id]);
    // The preference flipped to card B: card A becomes the second card.
    expect(gpu2Components({ ...sensors, gpu: cardB.sensors })).toEqual([cardA]);
  });

  it('never holds the integrated card, and is empty with a single discrete card', () => {
    expect(gpu2Components({ ...EMPTY_SENSORS, gpu: cardA.sensors, gpuComponents: [cardA, igpu] })).toEqual([]);
    expect(gpu2Components({ ...EMPTY_SENSORS, gpu: cardA.sensors, gpuComponents: [cardA] })).toEqual([]);
  });

  it('reaches the discrete card when the iGPU is the preferred primary', () => {
    expect(gpu2Components({ ...EMPTY_SENSORS, gpu: igpu.sensors, gpuComponents: [igpu, cardA] })).toEqual([cardA]);
  });
});
