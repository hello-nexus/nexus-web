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
    expect(staticMaxForDevice('motherboard', undefined, 'Voltage')).toBe(2);
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
    expect(staticMaxForDevice('psu', undefined, 'Voltage')).toBe(2);
    expect(staticMaxForDevice('embeddedController', undefined, 'Clock')).toBe(6000);
  });
});
