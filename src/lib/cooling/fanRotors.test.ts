import { describe, expect, it } from 'vitest';
import { NONE_CHANNEL, SIM_RPM_UNASSIGNED, simChannelId, type FanBinding } from './caseLayout';
import { fanRotorSpeeds } from './fanRotors';

const slots = [
  { key: 'front:120:0', taken: 'fan' as const },
  { key: 'rear:120:0', taken: 'fan' as const },
  { key: 'top:120:0', taken: 'radiator' as const },
  { key: 'rad:0', taken: 'fan' as const },
  { key: 'bottom:120:0', taken: null },
];
const channels = [{ id: '/gpu/0', rpm: 1300 }];

describe('fanRotorSpeeds', () => {
  it('turns a rotor for a simulated speed and for a real channel', () => {
    const bindings: FanBinding[] = [{ channelId: simChannelId(3000), slotKeys: ['front:120:0'] }, { channelId: '/gpu/0', slotKeys: ['rad:0'] }];
    const speeds = fanRotorSpeeds(slots, bindings, channels);
    expect(speeds.get('front:120:0')).toBe(3000);
    expect(speeds.get('rad:0')).toBe(1300);
  });

  it('spins the derived default speed, but not an empty mount, a radiator slot or a none binding', () => {
    const bindings: FanBinding[] = [{ channelId: simChannelId(SIM_RPM_UNASSIGNED), slotKeys: ['rear:120:0'] }, { channelId: NONE_CHANNEL, slotKeys: ['rad:0'] }];
    const speeds = fanRotorSpeeds(slots, bindings, channels);
    expect(speeds.get('rear:120:0')).toBe(SIM_RPM_UNASSIGNED);
    expect(speeds.has('rad:0')).toBe(false);
    expect(speeds.has('bottom:120:0')).toBe(false);
    expect(speeds.has('top:120:0')).toBe(false);
  });
});
