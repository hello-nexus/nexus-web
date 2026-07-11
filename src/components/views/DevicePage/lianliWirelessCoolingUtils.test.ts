import { describe, expect, it } from 'vitest';
import type { FanChannel } from '../../../api/cooling';
import type { LianLiWirelessFan } from '../../../api/lianli-wireless';
import { buildLianLiWirelessCoolingChains, lianliWirelessPortChannelId } from './lianliWirelessCoolingUtils';

function makeFan(overrides: Partial<LianLiWirelessFan>): LianLiWirelessFan {
  return {
    mac: '998D1DE566E1',
    masterMac: '8A0EEF6232DC',
    boundToUs: true,
    channel: 8,
    slot: 1,
    devType: 0,
    fanType: 24,
    fanCount: 3,
    rpm: [1918, 1905, 1892, 0],
    pwm: [45, 45, 45, 0],
    ...overrides,
  };
}

function makeChannel(overrides: Partial<FanChannel>): FanChannel {
  return {
    id: lianliWirelessPortChannelId('998D1DE566E1', 0),
    name: 'Wireless Fan 1',
    dutyPercent: 45,
    rpm: 1918,
    mode: 'Manual',
    ...overrides,
  };
}

describe('lianliWirelessPortChannelId', () => {
  it('matches the service Slv3CoolingProvider.PortId format', () => {
    expect(lianliWirelessPortChannelId('AABBCC', 2)).toBe('lianli-wireless:AABBCC:port2');
  });
});

describe('buildLianLiWirelessCoolingChains', () => {
  it('builds one chain per bound fan with a port per fanCount, joined to its channel', () => {
    const fan = makeFan({});
    const channels = [
      makeChannel({ id: lianliWirelessPortChannelId(fan.mac, 0), dutyPercent: 45, mode: 'Manual' }),
      makeChannel({ id: lianliWirelessPortChannelId(fan.mac, 1), dutyPercent: 6, mode: 'Auto' }),
      makeChannel({ id: lianliWirelessPortChannelId(fan.mac, 2), dutyPercent: 30, mode: 'Curve' }),
    ];

    const chains = buildLianLiWirelessCoolingChains([fan], channels);

    expect(chains).toHaveLength(1);
    expect(chains[0].mac).toBe(fan.mac);
    expect(chains[0].fanType).toBe(fan.fanType);
    expect(chains[0].ports).toHaveLength(3);
    expect(chains[0].ports[0]).toEqual({ port: 0, rpm: 1918, rpmUnavailable: false, channel: channels[0] });
    expect(chains[0].ports[1]).toEqual({ port: 1, rpm: 1905, rpmUnavailable: false, channel: channels[1] });
    expect(chains[0].ports[2]).toEqual({ port: 2, rpm: 1892, rpmUnavailable: false, channel: channels[2] });
  });

  it('leaves channel null when the /cooling/fans poll has no matching entry yet', () => {
    const fan = makeFan({ fanCount: 1 });
    const chains = buildLianLiWirelessCoolingChains([fan], []);
    expect(chains[0].ports).toEqual([{ port: 0, rpm: 1918, rpmUnavailable: false, channel: null }]);
  });

  it('skips fans not bound to us', () => {
    const fan = makeFan({ boundToUs: false });
    expect(buildLianLiWirelessCoolingChains([fan], [])).toEqual([]);
  });

  it('waits for channels before showing a bound chain that reports zero fans', () => {
    const fan = makeFan({ fanCount: 0 });
    expect(buildLianLiWirelessCoolingChains([fan], [])).toEqual([]);
  });

  it('honors the channel rpmUnavailable flag independently of fanCount', () => {
    // fanCount > 0 (fallback would be false) but the channel flags it: the flag wins.
    const fan = makeFan({ fanCount: 1 });
    const flagged = makeChannel({ id: lianliWirelessPortChannelId(fan.mac, 0), rpmUnavailable: true });
    const chains = buildLianLiWirelessCoolingChains([fan], [flagged]);
    expect(chains[0].ports[0].rpmUnavailable).toBe(true);
  });

  it('lets a channel rpmUnavailable false override the zero-fan fallback', () => {
    const fan = makeFan({ fanCount: 0 });
    const ch = makeChannel({ id: lianliWirelessPortChannelId(fan.mac, 0), rpmUnavailable: false });
    const chains = buildLianLiWirelessCoolingChains([fan], [ch]);
    expect(chains[0].ports[0].rpmUnavailable).toBe(false);
  });

  it('exposes a bound zero-fan chain as controllable, rpm-unavailable ports once its channels arrive', () => {
    const fan = makeFan({ fanCount: 0 });
    const channels = [
      makeChannel({ id: lianliWirelessPortChannelId(fan.mac, 0), dutyPercent: 50, mode: 'Manual', rpmUnavailable: true }),
      makeChannel({ id: lianliWirelessPortChannelId(fan.mac, 1), dutyPercent: 50, mode: 'Manual', rpmUnavailable: true }),
      makeChannel({ id: lianliWirelessPortChannelId(fan.mac, 2), dutyPercent: 50, mode: 'Manual', rpmUnavailable: true }),
      makeChannel({ id: lianliWirelessPortChannelId(fan.mac, 3), dutyPercent: 50, mode: 'Manual', rpmUnavailable: true }),
    ];
    const chains = buildLianLiWirelessCoolingChains([fan], channels);
    expect(chains[0].ports).toHaveLength(4);
    expect(chains[0].ports.every(p => p.rpmUnavailable)).toBe(true);
    expect(chains[0].ports[0].channel).toBe(channels[0]);
  });

  it('ignores channels belonging to other providers', () => {
    const fan = makeFan({ fanCount: 1 });
    const channels = [makeChannel({ id: 'np50:1A2B3C:port0' })];
    const chains = buildLianLiWirelessCoolingChains([fan], channels);
    expect(chains[0].ports[0].channel).toBeNull();
  });

  it('handles multiple bound chains independently', () => {
    const fanA = makeFan({ mac: 'AAAAAAAAAAAA', fanCount: 1 });
    const fanB = makeFan({ mac: 'BBBBBBBBBBBB', fanCount: 2, fanType: 36 });
    const chains = buildLianLiWirelessCoolingChains([fanA, fanB], []);
    expect(chains).toHaveLength(2);
    expect(chains[0].mac).toBe('AAAAAAAAAAAA');
    expect(chains[1].mac).toBe('BBBBBBBBBBBB');
    expect(chains[1].ports).toHaveLength(2);
  });
});
