import { describe, expect, it } from 'vitest';
import type { DeviceMapResponse, DeviceSegment, DeviceZone } from '../../../../api/lighting';
import {
  baselineFrom,
  buildDeviceMapSaveBody,
  buildSavePlan,
  checkMerge,
  defaultPartitionGuess,
  emptyHistory,
  flattenDeviceMap,
  isStagedZoneId,
  mergeStagedZones,
  mergeZoneSlices,
  orderZones,
  partitionSaveBody,
  pushHistory,
  redoHistory,
  relabelLedZones,
  renameZone,
  segmentOffsets,
  splitStagedZones,
  splitZone,
  stagedZoneId,
  toZoneLocalIndices,
  undoHistory,
  zoneDeviceIndices,
  zoneLedCount,
  zoneTouchesResizable,
  type EditorLed,
  type EditorSnapshot,
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

  it('rejects a selection containing a disjoint-slice zone', () => {
    // Zone d's slices are not device-contiguous (a hole owned by e sits
    // between them). d and e are consecutive in first-slice order, so only
    // the device-contiguity guard blocks the merge.
    const disjoint = [
      zone('d', [{ segment: 0, start: 0, count: 1 }, { segment: 0, start: 2, count: 2 }]),
      zone('e', [{ segment: 0, start: 1, count: 1 }]),
      zone('c', [{ segment: 1, start: 0, count: 3 }]),
    ];
    expect(checkMerge(new Set(['d', 'e']), disjoint, segments, offsets)).toEqual({ ok: false, reason: 'adjacency' });
  });

  it('rejects positionally adjacent zones split by another zone tail', () => {
    // x starts first and ends last, so f and g sit consecutively in the
    // first-slice ordering while x's tail interleaves between them.
    const interleaved = [
      zone('x', [{ segment: 0, start: 0, count: 1 }, { segment: 1, start: 0, count: 1 }]),
      zone('f', [{ segment: 0, start: 1, count: 3 }]),
      zone('g', [{ segment: 1, start: 1, count: 2 }]),
    ];
    expect(checkMerge(new Set(['f', 'g']), interleaved, segments, offsets)).toEqual({ ok: false, reason: 'adjacency' });
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

describe('staged partition edits', () => {
  const offsets = segmentOffsets(segments);
  const zones = [
    zone('a', [{ segment: 0, start: 0, count: 2 }], 'Keys left'),
    zone('b', [{ segment: 0, start: 2, count: 2 }], 'Keys right'),
    zone('c', [{ segment: 1, start: 0, count: 3 }], 'Underglow'),
    zone('w', [{ segment: 2, start: 0, count: 5 }], 'Header'),
  ];

  const idSeq = () => {
    let n = 0;
    return () => stagedZoneId(n++);
  };

  it('marks staged temp ids and nothing else', () => {
    expect(isStagedZoneId(stagedZoneId(3))).toBe(true);
    expect(isStagedZoneId('dev-1')).toBe(false);
  });

  it('renames one zone in place, keeping ids', () => {
    const renamed = renameZone(zones, 'c', 'Logo strip');
    expect(renamed.map(z => z.id)).toEqual(['a', 'b', 'c', 'w']);
    expect(renamed[2]).toMatchObject({ id: 'c', name: 'Logo strip' });
    expect(renamed[0].name).toBe('Keys left');
  });

  it('merges into a temp-id zone at the block position with the first member name', () => {
    const merged = mergeStagedZones(zones, offsets, new Set(['a', 'b']), stagedZoneId(0));
    expect(merged).toEqual([
      { id: stagedZoneId(0), name: 'Keys left', slices: [{ segment: 0, start: 0, count: 4 }] },
      zones[2],
      zones[3],
    ]);
  });

  it('splits into temp-id parts in place and reports the split-out id', () => {
    const parts = splitZone(zones[2], offsets, new Set([5]));
    expect(parts).not.toBeNull();
    const res = splitStagedZones(zones, offsets, 'c', parts!, 'Logo', idSeq());
    expect(res.newZoneId).toBe(stagedZoneId(1));
    expect(res.zones).toEqual([
      zones[0],
      zones[1],
      { id: stagedZoneId(0), name: 'Underglow', slices: [{ segment: 1, start: 0, count: 1 }] },
      { id: stagedZoneId(1), name: 'Logo', slices: [{ segment: 1, start: 1, count: 1 }] },
      { id: stagedZoneId(2), name: 'Underglow', slices: [{ segment: 1, start: 2, count: 1 }] },
      zones[3],
    ]);
  });

  it('builds an id-free partition save body in device order', () => {
    const shuffled = [zones[2], zones[0], zones[3], zones[1]];
    expect(partitionSaveBody(shuffled, offsets)).toEqual([
      { name: 'Keys left', slices: [{ segment: 0, start: 0, count: 2 }] },
      { name: 'Keys right', slices: [{ segment: 0, start: 2, count: 2 }] },
      { name: 'Underglow', slices: [{ segment: 1, start: 0, count: 3 }] },
      { name: 'Header', slices: [{ segment: 2, start: 0, count: 5 }] },
    ]);
  });

  it('guesses the reset default as the loaded zones when they already are the default', () => {
    const structure = { segments, zones, isDefaultPartition: true };
    expect(defaultPartitionGuess(structure, idSeq())).toBe(zones);
  });

  it('guesses one zone per segment otherwise, named after the segment', () => {
    const structure = { segments, zones, isDefaultPartition: false };
    const guess = defaultPartitionGuess(structure, idSeq());
    expect(guess).toEqual([
      { id: stagedZoneId(0), name: 'Segment 0', slices: [{ segment: 0, start: 0, count: 4 }] },
      { id: stagedZoneId(1), name: 'Segment 1', slices: [{ segment: 1, start: 0, count: 3 }] },
      { id: stagedZoneId(2), name: 'Segment 2', slices: [{ segment: 2, start: 0, count: 5 }] },
    ]);
  });

  it('relabels LED zone membership without touching positions or ownership', () => {
    const merged = mergeStagedZones(zones, offsets, new Set(['a', 'b']), stagedZoneId(0));
    const leds = [
      led({ index: 0, zoneId: 'a', u: 0.1 }),
      led({ index: 3, zoneId: 'b', isCustom: true }),
      led({ index: 5, zoneId: 'c' }),
    ];
    const relabeled = relabelLedZones(leds, merged, offsets);
    expect(relabeled.map(l => l.zoneId)).toEqual([stagedZoneId(0), stagedZoneId(0), 'c']);
    expect(relabeled[0].u).toBe(0.1);
    expect(relabeled[1].isCustom).toBe(true);
    // Untouched membership keeps the same object.
    expect(relabeled[2]).toBe(leds[2]);
  });
});

describe('buildSavePlan', () => {
  const offsets = segmentOffsets(segments);
  const zones = [
    zone('a', [{ segment: 0, start: 0, count: 2 }], 'Left'),
    zone('b', [{ segment: 0, start: 2, count: 2 }], 'Right'),
  ];
  const mapArgs = {
    offsets,
    leds: [led({ segment: 0, ledIndex: 1, index: 1, u: 0.2, v: 0.3, isCustom: true })],
    baseline: new Map(),
    rectRatio: 2,
    loadedRatio: 16 / 9,
  };

  it('posts nothing for zones when no partition is staged', () => {
    const plan = buildSavePlan({ ...mapArgs, staged: null });
    expect(plan.partition).toBeNull();
    expect(plan.map.overrides).toEqual([{ segment: 0, ledIndex: 1, u: 0.2, v: 0.3, disabled: false }]);
    expect(plan.map.aspectRatio).toBe(2);
  });

  it('carries an id-free zones body for a staged edit alongside the map delta', () => {
    const plan = buildSavePlan({ ...mapArgs, staged: { kind: 'edited', zones } });
    expect(plan.partition).toEqual({
      kind: 'edited',
      zones: [
        { name: 'Left', slices: [{ segment: 0, start: 0, count: 2 }] },
        { name: 'Right', slices: [{ segment: 0, start: 2, count: 2 }] },
      ],
    });
    expect(plan.map.overrides).toHaveLength(1);
  });

  it('marks a staged reset as the partition DELETE', () => {
    const plan = buildSavePlan({ ...mapArgs, staged: { kind: 'reset', zones } });
    expect(plan.partition).toEqual({ kind: 'reset' });
    expect(plan.map.overrides).toHaveLength(1);
  });
});

describe('editor history', () => {
  const snap = (over: Partial<EditorSnapshot>): EditorSnapshot => ({
    leds: [],
    rectRatio: 16 / 9,
    partition: null,
    ...over,
  });

  it('caps the undo depth and clears redo on push', () => {
    let h = emptyHistory();
    h = pushHistory(h, snap({ rectRatio: 1 }), 2);
    h = pushHistory(h, snap({ rectRatio: 2 }), 2);
    h = pushHistory(h, snap({ rectRatio: 3 }), 2);
    expect(h.undo.map(s => s.rectRatio)).toEqual([2, 3]);
    expect(h.redo).toEqual([]);
  });

  it('round-trips a partition op through undo and redo', () => {
    const before = snap({ leds: [led({ index: 0, zoneId: 'a' })], partition: null });
    const afterSplit = snap({
      leds: [led({ index: 0, zoneId: stagedZoneId(0) })],
      partition: { kind: 'edited', zones: [zone(stagedZoneId(0), [{ segment: 0, start: 0, count: 4 }])] },
    });

    // Stage the split: push the pre-op snapshot.
    let h = pushHistory(emptyHistory(), before, 10);

    // Undo: restores the pre-op snapshot (leds + partition together).
    const undone = undoHistory(h, afterSplit);
    expect(undone).not.toBeNull();
    expect(undone!.restored.partition).toBeNull();
    expect(undone!.restored.leds[0].zoneId).toBe('a');
    h = undone!.history;
    expect(h.undo).toHaveLength(0);
    expect(h.redo).toHaveLength(1);

    // Redo: restores the staged partition and the relabeled leds.
    const redone = redoHistory(h, before);
    expect(redone).not.toBeNull();
    expect(redone!.restored.partition).toEqual(afterSplit.partition);
    expect(redone!.restored.leds[0].zoneId).toBe(stagedZoneId(0));
    expect(redone!.history.undo).toHaveLength(1);
    expect(redone!.history.redo).toHaveLength(0);
  });

  it('returns null when there is nothing to undo or redo', () => {
    expect(undoHistory(emptyHistory(), snap({}))).toBeNull();
    expect(redoHistory(emptyHistory(), snap({}))).toBeNull();
  });
});

describe('baselineFrom', () => {
  it('captures only LEDs without a stored user override', () => {
    const baseline = baselineFrom([
      led({ index: 0, u: 0.1, v: 0.2 }),
      led({ index: 1, u: 0.3, v: 0.4, isCustom: true }),
    ]);
    expect(baseline.get(0)).toEqual({ u: 0.1, v: 0.2, disabled: false });
    expect(baseline.has(1)).toBe(false);
  });

  it('records the disabled state so a restore-in-place is detectable', () => {
    const baseline = baselineFrom([led({ index: 0, disabled: true })]);
    expect(baseline.get(0)).toEqual({ u: 0.5, v: 0.5, disabled: true });
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
    const body = buildDeviceMapSaveBody({ ...baseArgs, leds, baseline: new Map([[6, { u: 0.5, v: 0.5, disabled: false }]]) });
    expect(body.overrides).toEqual([{ segment: 1, ledIndex: 2, u: 0.2, v: 0.3, disabled: false }]);
  });

  it('drops a touched LED returned to its baseline spot, unless parked', () => {
    const baseline = new Map([
      [0, { u: 0.5, v: 0.5, disabled: false }],
      [1, { u: 0.5, v: 0.5, disabled: false }],
    ]);
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

  it('persists a mapping-disabled LED restored without being moved', () => {
    // Baseline parked, session re-enabled at the same u,v: only the
    // disabled flag diverges, and that alone must round-trip.
    const baseline = new Map([[0, { u: 0.5, v: 0.5, disabled: true }]]);
    const body = buildDeviceMapSaveBody({
      ...baseArgs,
      leds: [led({ index: 0, isCustom: true })],
      baseline,
    });
    expect(body.overrides).toEqual([{ segment: 0, ledIndex: 0, u: 0.5, v: 0.5, disabled: false }]);
  });

  it('drops a restore-then-park round trip back to the parked baseline', () => {
    const baseline = new Map([[0, { u: 0.5, v: 0.5, disabled: true }]]);
    const body = buildDeviceMapSaveBody({
      ...baseArgs,
      leds: [led({ index: 0, isCustom: true, disabled: true })],
      baseline,
    });
    expect(body.overrides).toEqual([]);
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
