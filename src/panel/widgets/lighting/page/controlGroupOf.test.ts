import { describe, expect, it } from 'vitest';
import { controlGroupOf } from './controlGroupOf';
import type { LightingDevice } from '../../../../api/lighting';

const dev = (id: string, parentDeviceId?: string): LightingDevice =>
  ({ id, name: id, parentDeviceId, ledsOn: true, controlled: true, ledCount: 60 } as unknown as LightingDevice);

describe('controlGroupOf', () => {
  const devices = [
    dev('smarthub:SH01:port1', 'smarthub:SH01'),
    dev('smarthub:SH01:port2', 'smarthub:SH01'),
    dev('smarthub:SH02:port1', 'smarthub:SH02'),
    dev('np50:A:port1', 'np50:A'),
    dev('openrgb-x'),
  ];

  it('widens a SmartHub port to every port of that hub only', () => {
    expect([...controlGroupOf(devices, devices[0])]).toEqual(['smarthub:SH01:port1', 'smarthub:SH01:port2']);
  });

  it('leaves every other device on its own', () => {
    expect([...controlGroupOf(devices, devices[3])]).toEqual(['np50:A:port1']);
    expect([...controlGroupOf(devices, devices[4])]).toEqual(['openrgb-x']);
  });
});
