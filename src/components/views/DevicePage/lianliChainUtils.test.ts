// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LianLiWirelessChainLighting } from '../../../api/lianli-wireless';
import { applyChainPatch, canMerge, mergeLeaderMac, moveInSequence, sortBySequence } from './lianliChainUtils';

function chain(mac: string, extra: Partial<LianLiWirelessChainLighting> = {}): LianLiWirelessChainLighting {
  return {
    mac, kind: 'fans', devType: 0, model: '', fanType: 51, fanCount: 1, lanes: 0, ledsPerLane: 0,
    modes: [], supportsPerLane: false, mode: 'rainbow', speed: 3, direction: 0, brightness: 4, colors: [], laneSettings: [],
    ...extra,
  };
}

const zones = [
  { id: 'up' as const, ledCount: 13, mode: 'rainbow', speed: 3, direction: 0, brightness: 4, colors: [] },
  { id: 'down' as const, ledCount: 13, mode: 'rainbow', speed: 3, direction: 0, brightness: 4, colors: [] },
];

describe('applyChainPatch', () => {
  it('merges chain fields', () => {
    expect(applyChainPatch(chain('A'), { brightness: 1, merge: true })).toMatchObject({ brightness: 1, merge: true });
  });

  it('merges a zone patch into the zone with that id only', () => {
    const next = applyChainPatch(chain('A', { zones }), { zones: [{ id: 'down', mode: 'static', speed: 1 }] });
    expect(next.zones?.[0]).toEqual(zones[0]);
    expect(next.zones?.[1]).toMatchObject({ id: 'down', mode: 'static', speed: 1, ledCount: 13, brightness: 4 });
  });

  it('ignores a zone patch on a chain without zones', () => {
    expect(applyChainPatch(chain('A'), { zones: [{ id: 'up', mode: 'static' }] }).zones).toBeUndefined();
  });
});

describe('sortBySequence', () => {
  it('orders by sort index and breaks ties on the MAC', () => {
    const list = [chain('A', { sortIndex: 1 }), chain('C', { sortIndex: 0 }), chain('B', { sortIndex: 0 })];
    expect(sortBySequence(list).map(c => c.mac)).toEqual(['B', 'C', 'A']);
    expect(sortBySequence([chain('Y'), chain('X')]).map(c => c.mac)).toEqual(['X', 'Y']);
  });
});

describe('moveInSequence', () => {
  it('renumbers by position so units that all start at zero become distinct', () => {
    const list = [chain('A', { sortIndex: 0 }), chain('B', { sortIndex: 0 })];
    expect(moveInSequence(list, 'A', 1)).toEqual([{ mac: 'A', sortIndex: 1 }]);
  });

  it('swaps two numbered units and returns both', () => {
    const list = [chain('A', { sortIndex: 0 }), chain('B', { sortIndex: 1 })];
    expect(moveInSequence(list, 'B', -1)).toEqual([{ mac: 'B', sortIndex: 0 }, { mac: 'A', sortIndex: 1 }]);
  });

  it('does nothing at either end or for an unknown unit', () => {
    const list = [chain('A', { sortIndex: 0 }), chain('B', { sortIndex: 1 })];
    expect(moveInSequence(list, 'A', -1)).toEqual([]);
    expect(moveInSequence(list, 'B', 1)).toEqual([]);
    expect(moveInSequence(list, 'Z', 1)).toEqual([]);
  });
});

const modes = [
  { key: 'rainbow', hasSpeed: true, hasDirection: true, colorsMin: 0, colorsMax: 0, mergeable: true },
  { key: 'twinkle', hasSpeed: true, hasDirection: true, colorsMin: 0, colorsMax: 0 },
];

describe('canMerge', () => {
  it('needs a mergeable effect, not custom, per zone or per lane', () => {
    expect(canMerge(chain('A', { modes, mode: 'rainbow' }))).toBe(true);
    expect(canMerge(chain('A', { modes, mode: 'twinkle' }))).toBe(false);
    expect(canMerge(chain('A', { modes, mode: 'perZone' }))).toBe(false);
    expect(canMerge(chain('A', { modes, mode: 'custom', effectMode: 'rainbow' }))).toBe(false);
  });
});

describe('mergeLeaderMac', () => {
  it('is the first unit with merge on and a mergeable effect, in sequence order then MAC', () => {
    const list = [
      chain('A', { modes, sortIndex: 0, merge: true, mode: 'perZone' }),
      chain('C', { modes, sortIndex: 1, merge: true }),
      chain('B', { modes, sortIndex: 1, merge: true }),
    ];
    expect(mergeLeaderMac(list)).toBe('B');
  });

  it('is null when no unit qualifies', () => {
    expect(mergeLeaderMac([chain('A', { modes }), chain('B', { modes, merge: false })])).toBeNull();
    expect(mergeLeaderMac([chain('A', { modes, merge: true, mode: 'custom' })])).toBeNull();
  });
});
