import { describe, expect, it } from 'vitest';
import type { DeviceMapResponse, DeviceSegment, DeviceZone } from '../../../../api/lighting';
import {
  baselineFrom,
  buildDeviceMapSaveBody,
  buildMergeZonesBody,
  buildSplitZonesBody,
  checkMerge,
  flattenDeviceMap,
  mergeZoneSlices,
  orderZones,
  segmentOffsets,
  splitZone,
  toZoneLocalIndices,
  zoneDeviceIndices,
  zoneLedCount,
  zoneTouchesResizable,
  type EditorLed,
} from './zoneUtils';

const segment = (index: number, ledCount: number, resizable = false): DeviceSegment => ({
  index,
  name: `Segment ${index}`,
  ledCount,
  resizable,
  zoneType: 'linear',
});

// Keyboard-style device: fixed keys + fixed underglow + a resizable header.
const segments: DeviceSegment[] = [
  segment(0, 4),
  segment(1, 3),
  segment(2, 5, true),
];

const zone = (id: string, slices: DeviceZone['slices'], name = id): DeviceZone => ({ id, name, slices });

const led = (over: Partial<EditorLed>): EditorLed => ({
  segment: 0,
  ledIndex: 0,
  index: 0,
  u: 0.5,
  v: 0.5,
  disabled: false,
  zoneId: 'z0',
  isCustom: false,
  ...over,
});

describe('segmentOffsets', () => {
  it('concatenates segments in index order regardless of input order', () => {
    const offsets = segmentOffsets([segment(2, 5), segment(0, 4), segment(1, 3)]);
    expect(offsets.get(0)).toBe(0);
    expect(offsets.get(1)).toBe(4);
    expect(offsets.get(2)).toBe(7);
  });
});

describe('flattenDeviceMap', () => {
  it('assigns stable device-space indices across segments', () => {
    const map: DeviceMapResponse = {
      id: 'dev',
      aspectRatio: 0,
      segments: [
        {
          index: 1, name: 'B', resizable: false, ledCount: 2,
          leds: [
            { index: 1, u: 0.4, v: 0.4, disabled: false, zoneId: 'z1', isCustom: false },
            { index: 0, u: 0.3, v: 0.3, disabled: true, zoneId: 'z1', isCustom: true },
          ],
        },
        {
          index: 0, name: 'A', resizable: false, ledCount: 1,
          leds: [{ index: 0, u: 0.1, v: 0.2, disabled: false, zoneId: 'z0', isCustom: false }],
        },
      ],
    };
    const flat = flattenDeviceMap(map);
    expect(flat.map(l => l.index)).toEqual([0, 1, 2]);
    expect(flat[1]).toMatchObject({ segment: 1, ledIndex: 0, index: 1, disabled: true, isCustom: true });
    expect(flat[2]).toMatchObject({ segment: 1, ledIndex: 1, index: 2, zoneId: 'z1' });
  });
});

describe('zone index math', () => {
  const offsets = segmentOffsets(segments);
  const spanning = zone('span', [
    { segment: 0, start: 2, count: 2 },
    { segment: 1, start: 0, count: 3 },
  ]);

  it('counts LEDs across slices', () => {
    expect(zoneLedCount(spanning)).toBe(5);
  });

  it('expands slices into ordered device indices', () => {
    expect(zoneDeviceIndices(spanning, offsets)).toEqual([2, 3, 4, 5, 6]);
  });

  it('maps device indices to zone-local indices and drops outsiders', () => {
    expect(toZoneLocalIndices(spanning, offsets, [3, 6, 11])).toEqual([1, 4]);
  });
});

describe('zoneTouchesResizable', () => {
  it('flags zones with any slice on a resizable segment', () => {
    expect(zoneTouchesResizable(zone('w', [{ segment: 2, start: 0, count: 5 }]), segments)).toBe(true);
    expect(zoneTouchesResizable(zone('f', [{ segment: 0, start: 0, count: 4 }]), segments)).toBe(false);
  });
});

describe('orderZones', () => {
  it('sorts zones by their first slice device position', () => {
    const offsets = segmentOffsets(segments);
    const zones = [
      zone('c', [{ segment: 2, start: 0, count: 5 }]),
      zone('a', [{ segment: 0, start: 0, count: 2 }]),
      zone('b', [{ segment: 0, start: 2, count: 2 }, { segment: 1, start: 0, count: 3 }]),
    ];
    expect(orderZones(zones, offsets).map(z => z.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('checkMerge', () => {
  const offsets = segmentOffsets(segments);
  const zones = [
    zone('a', [{ segment: 0, start: 0, count: 2 }]),
    zone('b', [{ segment: 0, start: 2, count: 2 }]),
    zone('c', [{ segment: 1, start: 0, count: 3 }]),
    zone('w', [{ segment: 2, start: 0, count: 5 }]),
  ];

  it('requires at least two selected zones', () => {
    expect(checkMerge(new Set(['a']), zones, segments, offsets)).toEqual({ ok: false, reason: 'selection' });
  });

  it('rejects non-adjacent selections', () => {
    expect(checkMerge(new Set(['a', 'c']), zones, segments, offsets)).toEqual({ ok: false, reason: 'adjacency' });
  });

  it('rejects selections touching a resizable segment', () => {
    expect(checkMerge(new Set(['c', 'w']), zones, segments, offsets)).toEqual({ ok: false, reason: 'wall' });
  });

  it('accepts adjacent fixed-segment zones, even across a segment boundary', () => {
    expect(checkMerge(new Set(['a', 'b']), zones, segments, offsets)).toEqual({ ok: true, reason: null });
    expect(checkMerge(new Set(['b', 'c']), zones, segments, offsets)).toEqual({ ok: true, reason: null });
  });
});

describe('mergeZoneSlices', () => {
  it('joins abutting runs within a segment and keeps cross-segment slices apart', () => {
    const merged = mergeZoneSlices([
      zone('a', [{ segment: 0, start: 0, count: 2 }]),
      zone('b', [{ segment: 0, start: 2, count: 2 }, { segment: 1, start: 0, count: 1 }]),
      zone('c', [{ segment: 1, start: 1, count: 2 }]),
    ]);
    expect(merged).toEqual([
      { segment: 0, start: 0, count: 4 },
      { segment: 1, start: 0, count: 3 },
    ]);
  });
});

describe('splitZone', () => {
  const offsets = segmentOffsets(segments);
  const spanning = zone('span', [
    { segment: 0, start: 0, count: 4 },
    { segment: 1, start: 0, count: 3 },
  ]);

  it('splits a middle run into before / selected / after', () => {
    const parts = splitZone(spanning, offsets, new Set([2, 3, 4]));
    expect(parts).toEqual({
      before: [{ segment: 0, start: 0, count: 2 }],
      selected: [{ segment: 0, start: 2, count: 2 }, { segment: 1, start: 0, count: 1 }],
      after: [{ segment: 1, start: 1, count: 2 }],
    });
  });

  it('returns empty edges for a selection anchored at the zone start', () => {
    const parts = splitZone(spanning, offsets, new Set([0, 1]));
    expect(parts).toEqual({
      before: [],
      selected: [{ segment: 0, start: 0, count: 2 }],
      after: [{ segment: 0, start: 2, count: 2 }, { segment: 1, start: 0, count: 3 }],
    });
  });

  it('rejects non-contiguous selections', () => {
    expect(splitZone(spanning, offsets, new Set([0, 2]))).toBeNull();
  });

  it('rejects empty and whole-zone selections', () => {
    expect(splitZone(spanning, offsets, new Set())).toBeNull();
    expect(splitZone(spanning, offsets, new Set([0, 1, 2, 3, 4, 5, 6]))).toBeNull();
  });

  it('ignores selected indices outside the zone', () => {
    const parts = splitZone(spanning, offsets, new Set([0, 1, 11]));
    expect(parts?.selected).toEqual([{ segment: 0, start: 0, count: 2 }]);
  });
});

describe('partition POST bodies', () => {
  const offsets = segmentOffsets(segments);
  const zones = [
    zone('a', [{ segment: 0, start: 0, count: 2 }], 'Keys left'),
    zone('b', [{ segment: 0, start: 2, count: 2 }], 'Keys right'),
    zone('c', [{ segment: 1, start: 0, count: 3 }], 'Underglow'),
    zone('w', [{ segment: 2, start: 0, count: 5 }], 'Header'),
  ];

  it('builds a merge body that keeps device order and the first member name', () => {
    const body = buildMergeZonesBody(zones, offsets, new Set(['a', 'b']));
    expect(body).toEqual([
      { name: 'Keys left', slices: [{ segment: 0, start: 0, count: 4 }] },
      { name: 'Underglow', slices: [{ segment: 1, start: 0, count: 3 }] },
      { name: 'Header', slices: [{ segment: 2, start: 0, count: 5 }] },
    ]);
  });

  it('builds a split body replacing the zone with named parts in place', () => {
    const parts = splitZone(zones[2], offsets, new Set([5]));
    expect(parts).not.toBeNull();
    const body = buildSplitZonesBody(zones, offsets, 'c', parts!, 'Logo');
    expect(body).toEqual([
      { name: 'Keys left', slices: [{ segment: 0, start: 0, count: 2 }] },
      { name: 'Keys right', slices: [{ segment: 0, start: 2, count: 2 }] },
      { name: 'Underglow', slices: [{ segment: 1, start: 0, count: 1 }] },
      { name: 'Logo', slices: [{ segment: 1, start: 1, count: 1 }] },
      { name: 'Underglow', slices: [{ segment: 1, start: 2, count: 1 }] },
      { name: 'Header', slices: [{ segment: 2, start: 0, count: 5 }] },
    ]);
  });
});

describe('baselineFrom', () => {
  it('captures only LEDs without a stored user override', () => {
    const baseline = baselineFrom([
      led({ index: 0, u: 0.1, v: 0.2 }),
      led({ index: 1, u: 0.3, v: 0.4, isCustom: true }),
    ]);
    expect(baseline.get(0)).toEqual({ u: 0.1, v: 0.2 });
    expect(baseline.has(1)).toBe(false);
  });
});

describe('buildDeviceMapSaveBody', () => {
  const baseArgs = {
    rectRatio: 16 / 9,
    loadedRatio: 16 / 9,
  };

  it('skips mapping-positioned and mapping-disabled LEDs the user never touched', () => {
    const leds = [
      led({ index: 0, u: 0.1, v: 0.9 }),
      led({ index: 1, disabled: true }),
    ];
    const body = buildDeviceMapSaveBody({ ...baseArgs, leds, baseline: baselineFrom(leds) });
    expect(body.overrides).toEqual([]);
  });

  it('keeps overrides as segment-local addresses', () => {
    const leds = [led({ segment: 1, ledIndex: 2, index: 6, u: 0.2, v: 0.3, isCustom: true })];
    const body = buildDeviceMapSaveBody({ ...baseArgs, leds, baseline: new Map([[6, { u: 0.5, v: 0.5 }]]) });
    expect(body.overrides).toEqual([{ segment: 1, ledIndex: 2, u: 0.2, v: 0.3, disabled: false }]);
  });

  it('drops a touched LED returned to its baseline spot, unless disabled', () => {
    const baseline = new Map([[0, { u: 0.5, v: 0.5 }], [1, { u: 0.5, v: 0.5 }]]);
    const body = buildDeviceMapSaveBody({
      ...baseArgs,
      leds: [
        led({ index: 0, isCustom: true }),
        led({ index: 1, ledIndex: 1, isCustom: true, disabled: true }),
      ],
      baseline,
    });
    expect(body.overrides).toEqual([{ segment: 0, ledIndex: 1, u: 0.5, v: 0.5, disabled: true }]);
  });

  it('re-posts stored overrides so a full-replace save preserves them', () => {
    // A loaded user override has no baseline entry; it must survive every
    // save even when untouched this session.
    const body = buildDeviceMapSaveBody({
      ...baseArgs,
      leds: [led({ index: 0, u: 0.7, v: 0.7, isCustom: true })],
      baseline: new Map(),
    });
    expect(body.overrides).toHaveLength(1);
  });

  it('sends a zero ratio when unchanged and the live ratio once it diverges', () => {
    const unchanged = buildDeviceMapSaveBody({ leds: [], baseline: new Map(), rectRatio: 2, loadedRatio: 2 });
    expect(unchanged.aspectRatio).toBe(0);
    const changed = buildDeviceMapSaveBody({ leds: [], baseline: new Map(), rectRatio: 2, loadedRatio: 16 / 9 });
    expect(changed.aspectRatio).toBe(2);
  });
});
