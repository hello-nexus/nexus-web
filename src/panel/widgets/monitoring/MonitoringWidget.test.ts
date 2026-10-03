// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { HardwareSensor, SensorState } from '../../../hooks/useSensors';
import type { SensorExtras } from '../../../hooks/useSensorExtras';
import { EMPTY_SENSOR_EXTRAS } from '../../../hooks/useSensorExtras';
import { labelForDevice, percentForSensor, resolveSensor, staticMaxForDevice } from './MonitoringWidget';

function sensor(partial: Partial<HardwareSensor> & { id: string; name: string; type: string }): HardwareSensor {
  return { value: 0, units: '', formatted: '', parent: { id: '', name: '' }, ...partial };
}

const EMPTY_SENSORS: SensorState = {
  summary: [], cpu: [], gpu: [], gpuModel: '', gpuComponents: [], memory: [], storage: [], storageComponents: {},
  storageSensors: [], motherboard: [], motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
};

describe('resolveSensor - motherboard', () => {
  const fan1 = sensor({ id: 'fan-1', name: 'Fan 1', type: 'Fan' });
  const vrmTemp = sensor({ id: 'vrm-temp', name: 'VRM Temperature', type: 'Temperature' });
  const sensors: SensorState = { ...EMPTY_SENSORS, motherboard: [fan1, vrmTemp] };

  it('resolves any sensor by name, unlike the fan device which only falls back to Fan-typed sensors', () => {
    expect(resolveSensor(sensors, [], [], 'motherboard', 'vrm-temp')?.id).toBe('vrm-temp');
    // A stale/legacy name lookup on the fan device stays within Fan-typed
    // sensors and falls back to fan-1 rather than resolving a Temperature.
    expect(resolveSensor(sensors, [], [], 'fan', 'VRM Temperature')?.id).toBe('fan-1');
    expect(resolveSensor(sensors, [], [], 'motherboard', 'VRM Temperature')?.id).toBe('vrm-temp');
  });

  it('falls back to name lookup, then the first motherboard sensor', () => {
    expect(resolveSensor(sensors, [], [], 'motherboard', 'Fan 1')?.id).toBe('fan-1');
    expect(resolveSensor(sensors, [], [], 'motherboard', '')?.id).toBe('fan-1');
  });
});

describe('resolveSensor - quick', () => {
  const cpuTemp = sensor({ id: 'summary/cpu-temp', name: 'CPU Temperature', type: 'Temperature' });
  const cpuUsage = sensor({ id: 'summary/cpu-usage', name: 'CPU Usage', type: 'Load' });
  const sensors: SensorState = { ...EMPTY_SENSORS, summary: [cpuTemp, cpuUsage] };

  it('resolves by id, falling back to name, then the first summary sensor', () => {
    expect(resolveSensor(sensors, [], [], 'quick', 'summary/cpu-usage')?.id).toBe('summary/cpu-usage');
    expect(resolveSensor(sensors, [], [], 'quick', 'CPU Usage')?.id).toBe('summary/cpu-usage');
    expect(resolveSensor(sensors, [], [], 'quick', '')?.id).toBe('summary/cpu-temp');
  });
});

describe('labelForDevice - quick', () => {
  it('falls back to Quick with no sensor name', () => {
    expect(labelForDevice('quick', '')).toBe('Quick');
  });

  it('prefixes nothing (no Quick prefix map) when a sensor name is given, since summary names are self-describing', () => {
    expect(labelForDevice('quick', 'CPU Temperature')).toBe('CPU Temperature');
  });
});

describe('labelForDevice - motherboard', () => {
  it('abbreviates to MB with no sensor name, like the other device labels', () => {
    expect(labelForDevice('motherboard', '')).toBe('MB');
  });

  it('prefixes nothing (no MB prefix map) when a sensor name is given', () => {
    expect(labelForDevice('motherboard', 'VRM Temperature')).toBe('VRM Temperature');
  });
});

describe('staticMaxForDevice - motherboard', () => {
  it('picks a ceiling per sensor type', () => {
    expect(staticMaxForDevice('motherboard', undefined, 'Fan')).toBe(2500);
    expect(staticMaxForDevice('motherboard', undefined, 'Clock')).toBe(6000);
    expect(staticMaxForDevice('motherboard', undefined, 'Voltage')).toBe(2.5);
    expect(staticMaxForDevice('motherboard', undefined, 'Load')).toBe(100);
    expect(staticMaxForDevice('motherboard', undefined, 'Temperature')).toBe(100);
  });
});

describe('percentForSensor - motherboard', () => {
  it('clamps Load/Control/Level/Temperature straight through as 0-100', () => {
    expect(percentForSensor('motherboard', sensor({ id: 'a', name: 'a', type: 'Load', value: 42 }), 100)).toBe(42);
    expect(percentForSensor('motherboard', sensor({ id: 'a', name: 'a', type: 'Control', value: 75 }), 100)).toBe(75);
    expect(percentForSensor('motherboard', sensor({ id: 'a', name: 'a', type: 'Level', value: 10 }), 100)).toBe(10);
    expect(percentForSensor('motherboard', sensor({ id: 'a', name: 'a', type: 'Temperature', value: 65 }), 100)).toBe(65);
  });

  it('scales Fan/Voltage/Clock against the resolved ceiling', () => {
    expect(percentForSensor('motherboard', sensor({ id: 'a', name: 'a', type: 'Fan', value: 1250 }), 2500)).toBe(50);
    expect(percentForSensor('motherboard', sensor({ id: 'a', name: 'a', type: 'Voltage', value: 1 }), 2)).toBe(50);
    expect(percentForSensor('motherboard', sensor({ id: 'a', name: 'a', type: 'Clock', value: 3000 }), 6000)).toBe(50);
  });

  it('still prefers theoreticalMaximum over the type-based branch when present', () => {
    const withMax = sensor({ id: 'a', name: 'a', type: 'Voltage', value: 25, theoreticalMaximum: 100 });
    expect(percentForSensor('motherboard', withMax, 2)).toBe(25);
  });

  it('returns 0 for an undefined sensor', () => {
    expect(percentForSensor('motherboard', undefined, 100)).toBe(0);
  });
});

describe('resolveSensor - SSD SMART', () => {
  const compositeTemp = sensor({ id: '/nvme/0/temperature/0', name: 'Composite Temperature', type: 'Temperature' });
  const life = sensor({ id: '/nvme/0/life/0', name: 'Percentage Used', type: 'Level' });
  const sensors: SensorState = {
    ...EMPTY_SENSORS,
    storageComponents: {
      C: { id: 'C', name: 'Drive C', capacity: '1 TB', freeSpace: '', usedSpace: '', usedPercentage: '' },
      'smart/nvme/0': { id: 'smart/nvme/0', name: 'Test NVMe', capacity: '', freeSpace: '', usedSpace: '', usedPercentage: '', sensors: [compositeTemp, life] },
    },
  };

  it('resolves by id, falling back to name, then the first smart/*-flattened sensor', () => {
    expect(resolveSensor(sensors, [], [], 'smart', '/nvme/0/temperature/0')?.id).toBe('/nvme/0/temperature/0');
    expect(resolveSensor(sensors, [], [], 'smart', 'Percentage Used')?.id).toBe('/nvme/0/life/0');
    expect(resolveSensor(sensors, [], [], 'smart', '')?.id).toBe('/nvme/0/temperature/0');
  });

  it('never resolves a DriveInfo logical-volume sensor for the smart device', () => {
    // 'C' matches nothing in the smart/*-flattened list (DriveInfo components
    // carry no `sensors` array), so it falls back to the first smart sensor -
    // never a logical-volume one, since that list never contains any.
    expect(resolveSensor(sensors, [], [], 'smart', 'C')?.id).toBe('/nvme/0/temperature/0');
  });
});

describe('resolveSensor - extras-topic devices', () => {
  const dimmTemp = sensor({ id: '/memory/dimm/0/temperature/0', name: 'DIMM #0', type: 'Temperature' });
  const chargeLevel = sensor({ id: 'battery/0/charge', name: 'Charge Level', type: 'Level' });
  const extras: SensorExtras = {
    ...EMPTY_SENSOR_EXTRAS,
    memoryModules: [{ id: '/memory/dimm/0', name: 'DIMM 0', sensors: [dimmTemp] }],
    batteries: [{ id: 'battery/0', name: 'Battery', sensors: [chargeLevel] }],
  };

  it('resolves a memoryModule sensor by id from the extras param', () => {
    expect(resolveSensor(EMPTY_SENSORS, [], [], 'memoryModule', '/memory/dimm/0/temperature/0', undefined, extras)?.id)
      .toBe('/memory/dimm/0/temperature/0');
  });

  it('resolves a battery sensor by name from the extras param', () => {
    expect(resolveSensor(EMPTY_SENSORS, [], [], 'battery', 'Charge Level', undefined, extras)?.id)
      .toBe('battery/0/charge');
  });

  it('falls back to EMPTY_SENSOR_EXTRAS (no crash) when extras is omitted', () => {
    expect(resolveSensor(EMPTY_SENSORS, [], [], 'battery', 'Charge Level')).toBeUndefined();
  });
});

describe('percentForSensor / staticMaxForDevice - other heterogeneous devices', () => {
  it('treat SSD SMART and the extras-topic devices the same as motherboard: Level/Temperature clamp straight through', () => {
    expect(percentForSensor('smart', sensor({ id: 'a', name: 'a', type: 'Level', value: 12 }), 100)).toBe(12);
    expect(percentForSensor('battery', sensor({ id: 'a', name: 'a', type: 'Temperature', value: 30 }), 100)).toBe(30);
  });

  it('scale a non-percent type against the resolved ceiling', () => {
    expect(percentForSensor('cooler', sensor({ id: 'a', name: 'a', type: 'Fan', value: 1250 }), 2500)).toBe(50);
    expect(staticMaxForDevice('embeddedController', undefined, 'Clock')).toBe(6000);
  });
});

describe('percentForSensor - non-percent types on cpu/gpu', () => {
  it('scales Power and Clock against the resolved ceiling instead of reading watts or MHz as percent', () => {
    expect(percentForSensor('gpu', sensor({ id: 'a', name: 'GPU Package', type: 'Power', value: 300 }), 600)).toBe(50);
    expect(percentForSensor('cpu', sensor({ id: 'a', name: 'Core #1', type: 'Clock', value: 3000 }), 6000)).toBe(50);
  });

  // Typical readings per type, from a live Windows box: none may peg the
  // gauge or leave it empty on the default scale.
  it.each([
    ['cpu', 'Package', 'Power', 40.7, undefined],
    ['cpu', 'Core #1', 'Clock', 4558, undefined],
    ['cpu', 'Core #1 VID', 'Voltage', 1.2, undefined],
    ['gpu', 'GPU Package', 'Power', 97.9, undefined],
    ['gpu', 'GPU Core', 'Clock', 3100, undefined],
    ['gpu', 'GPU Memory', 'Clock', 10501, undefined],
    ['gpu', 'GPU Package', 'Power', 575, undefined],
    ['cpu', 'Package', 'Power', 253, undefined],
    ['gpu', 'GPU Fan 1', 'Fan', 1500, undefined],
    ['gpu', 'GPU Core Voltage', 'Voltage', 0.8, undefined],
    ['gpu', 'GPU PCIe Rx', 'Throughput', 2_000_000_000, undefined],
    ['gpu', 'GPU Memory Used', 'SmallData', 1061, 16303],
    ['quick', 'GPU Clock', 'Clock', 2500, undefined],
    ['quick', 'CPU Clock', 'Clock', 4558, undefined],
    ['motherboard', 'Fan #1', 'Fan', 1819, undefined],
    ['motherboard', 'Voltage #1', 'Voltage', 1.27, undefined],
    ['motherboard', 'CPU VCCIO', 'Voltage', 1.05, undefined],
    ['motherboard', '5VSB', 'Voltage', 5.02, undefined],
    ['motherboard', '+3V Standby', 'Voltage', 3.31, undefined],
    ['motherboard', '+12V', 'Voltage', 12.1, undefined],
    ['smart', 'Read Rate', 'Throughput', 3_500_000_000, undefined],
    ['psu', '+12V', 'Voltage', 12.1, undefined],
    ['psu', 'Total', 'Power', 450, undefined],
    ['storage', 'Used', 'Data', 1408.9, 1604.6],
    ['memory', 'Memory Used', 'Data', 8.47, 31.11],
  ] as const)('%s %s (%s) reads inside the gauge', (device, name, type, value, theoreticalMaximum) => {
    const s = sensor({ id: 'a', name, type, value, theoreticalMaximum });
    const percent = percentForSensor(device, s, theoreticalMaximum ?? staticMaxForDevice(device, name, type, value));
    expect(percent).toBeGreaterThan(1);
    expect(percent).toBeLessThan(99);
  });

  it('keeps Load and Temperature on their own 0-100 reading', () => {
    expect(percentForSensor('gpu', sensor({ id: 'a', name: 'GPU Core', type: 'Load', value: 42 }), 100)).toBe(42);
    expect(percentForSensor('cpu', sensor({ id: 'a', name: 'CPU Package', type: 'Temperature', value: 65 }), 100)).toBe(65);
  });
});

describe('resolveSensor + labelForDevice - igpu', () => {
  const dCore = sensor({ id: '/gpu-nvidia/0/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const iCore = sensor({ id: '/gpu-amd/0/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const iLoad = sensor({ id: '/gpu-amd/0/load/0', name: 'GPU Core', type: 'Load' });
  const igpu = { id: '/gpu-amd/0', name: 'AMD Radeon(TM) Graphics', integrated: true, sensors: [iCore, iLoad] };
  const dgpu = { id: '/gpu-nvidia/0', name: 'NVIDIA GeForce RTX 5080', integrated: false, sensors: [dCore] };
  const sensors: SensorState = { ...EMPTY_SENSORS, gpu: dgpu.sensors, gpuComponents: [igpu, dgpu] };

  it('resolves only within the integrated card: by id, by name, then GPU Core load', () => {
    expect(resolveSensor(sensors, [], [], 'igpu', iCore.id)).toBe(iCore);
    expect(resolveSensor(sensors, [], [], 'igpu', 'GPU Core')).toBe(iCore);
    expect(resolveSensor(sensors, [], [], 'igpu', '')).toBe(iLoad);
    expect(resolveSensor(sensors, [], [], 'igpu', dCore.id)).toBe(iCore);
    // The gpu category never reaches across to the iGPU's sensors.
    expect(resolveSensor(sensors, [], [], 'gpu', iCore.id)?.id).not.toBe(iCore.id);
  });

  it('captions an iGPU slot "iGPU <sensor>" with the GPU word stripped from the name', () => {
    expect(labelForDevice('igpu', 'GPU Core')).toBe('iGPU Core');
    expect(labelForDevice('igpu', '')).toBe('iGPU');
  });
});

describe('resolveSensor + labelForDevice - gpu2', () => {
  const aCore = sensor({ id: '/gpu-nvidia/0/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const bCore = sensor({ id: '/gpu-nvidia/1/temperature/0', name: 'GPU Core', type: 'Temperature' });
  const bLoad = sensor({ id: '/gpu-nvidia/1/load/0', name: 'GPU Core', type: 'Load' });
  const cardA = { id: '/gpu-nvidia/0', name: 'NVIDIA GeForce RTX 5080', integrated: false, sensors: [aCore] };
  const cardB = { id: '/gpu-nvidia/1', name: 'NVIDIA GeForce RTX 4070', integrated: false, sensors: [bCore, bLoad] };
  const sensors: SensorState = { ...EMPTY_SENSORS, gpu: cardA.sensors, gpuComponents: [cardA, cardB] };

  it('resolves only within the second card: by id, by name, then GPU Core load', () => {
    expect(resolveSensor(sensors, [], [], 'gpu2', bCore.id)).toBe(bCore);
    expect(resolveSensor(sensors, [], [], 'gpu2', 'GPU Core')).toBe(bCore);
    expect(resolveSensor(sensors, [], [], 'gpu2', '')).toBe(bLoad);
    expect(resolveSensor(sensors, [], [], 'gpu2', aCore.id)).toBe(bCore);
    expect(resolveSensor(sensors, [], [], 'gpu', bCore.id)?.id).not.toBe(bCore.id);
  });

  it('captions a second-card slot "GPU 2 <sensor>"', () => {
    expect(labelForDevice('gpu2', 'GPU Core')).toBe('GPU 2 Core');
    expect(labelForDevice('gpu2', '')).toBe('GPU 2');
  });
});
