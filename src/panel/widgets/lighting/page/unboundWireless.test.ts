import { describe, expect, it } from 'vitest';
import type { LianLiWirelessFan } from '../../../../api/lianli-wireless';
import { UNBOUND_WIRELESS_PREFIX, unboundWirelessCards, unboundWirelessFans } from './unboundWireless';

const fan = (over: Partial<LianLiWirelessFan>): LianLiWirelessFan => ({
  mac: 'AABBCCDDEE01',
  masterMac: '',
  boundToUs: false,
  channel: 8,
  slot: 0,
  devType: 0,
  fanType: 24,
  fanCount: 1,
  rpm: [],
  pwm: [],
  ...over,
});

describe('unboundWirelessFans', () => {
  it('keeps devices bound to no controller', () => {
    const f = fan({});
    expect(unboundWirelessFans({ isConnected: true, fans: [f] })).toEqual([f]);
  });

  it('drops bound, other-controller and wired-owned devices', () => {
    const fans = [
      fan({ mac: 'A', boundToUs: true, masterMac: 'M' }),
      fan({ mac: 'B', masterMac: 'OTHER' }),
      fan({ mac: 'C', wiredOwned: true }),
    ];
    expect(unboundWirelessFans({ isConnected: true, fans })).toEqual([]);
  });

  it('drops a unit that is the USB-driven HydroShift II, known by MAC or only present', () => {
    const fans = [fan({ mac: 'A', usbConnected: true }), fan({ mac: 'B', usbPresent: true }), fan({ mac: 'C' })];
    expect(unboundWirelessFans({ isConnected: true, fans }).map(f => f.mac)).toEqual(['C']);
  });

  it('is empty without a connected controller or state', () => {
    expect(unboundWirelessFans(null)).toEqual([]);
    expect(unboundWirelessFans({ isConnected: false, fans: [fan({})] })).toEqual([]);
  });
});

describe('unboundWirelessCards', () => {
  it('builds LED-less cards keyed by MAC', () => {
    const [card] = unboundWirelessCards([fan({})], () => 'Strimer');
    expect(card).toMatchObject({ id: `${UNBOUND_WIRELESS_PREFIX}AABBCCDDEE01`, name: 'Strimer', ledCount: 0, ledsOn: false });
  });

  it('tells identical labels apart by MAC tail', () => {
    const cards = unboundWirelessCards([fan({ mac: 'AAAA1111' }), fan({ mac: 'BBBB2222' })], () => 'Fan');
    expect(cards.map(c => c.name)).toEqual(['Fan 1111', 'Fan 2222']);
  });
});
