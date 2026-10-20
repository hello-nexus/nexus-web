// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { presetDeviceIds, presetTarget } from './firmwareChains';

describe('presetDeviceIds', () => {
  it('lists chains not in custom mode, including per zone, under the family prefix', () => {
    const chains = [{ mac: 'A', mode: 'custom' }, { mac: 'B', mode: 'perZone' }, { mac: 'C', mode: 'rainbow' }];
    expect(presetDeviceIds('lianli-flex:', chains)).toEqual(['lianli-flex:B', 'lianli-flex:C']);
  });
});

describe('presetTarget', () => {
  it('splits a device id into family and MAC', () => {
    expect(presetTarget('lianli-flex:AA11')).toEqual({ family: 'flex', mac: 'AA11' });
    expect(presetTarget('lianli-wireless:BB22')).toEqual({ family: 'wireless', mac: 'BB22' });
    expect(presetTarget('lianli:port0')).toBeNull();
  });
});
