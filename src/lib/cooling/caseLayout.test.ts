import { describe, expect, it } from 'vitest';
import t1State from './__fixtures__/t1-cooling-state.json';
import y70Layout from './__fixtures__/y70-case-layout.json';
import {
  collapseMounts, linkChannelToSlot, withBoundFans, defaultDirection, fanGeometries, parseCaseLayout, withDirection,
  type CaseLayout, type FanBinding,
} from './caseLayout';
import { slotDirections, slotSpeeds, withDefaultBindings } from './slotFlow';
import { slotModelFans } from './fanSpecs';

const valid = {
  size: [450, 230, 470],
  boxes: [
    { slot: 'fan', role: 'part', select: 'fan:front:120:0', min: [0, 10, 10], size: [25, 120, 120], fans: { axis: 'x', diameter: 114 } },
    { slot: 'fan', role: 'ghost', select: 'slot:rear:120:0', min: [425, 300, 50], size: [25, 120, 120] },
    { slot: 'gpu', role: 'part', min: [50, 50, 50], size: [300, 40, 120] },
  ],
  fanSlots: [
    { key: 'front:120:0', position: 'front', size: 120, index: 0, taken: 'fan' },
    { key: 'rear:120:0', position: 'rear', size: 120, index: 0, taken: null },
    { key: 'top:120:0', position: 'top', size: 120, index: 0, taken: null },
    { key: 'top:360:0', position: 'top', size: 360, index: 0, taken: 'radiator' },
  ],
};

describe('parseCaseLayout', () => {
  it('accepts a well-formed layout', () => {
    const l = parseCaseLayout(valid) as CaseLayout;
    expect(l.boxes).toHaveLength(3);
    expect(l.fanSlots).toHaveLength(4);
    expect(l.boxes[0].fans).toEqual({ axis: 'x', diameter: 114 });
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['no size', { ...valid, size: undefined }],
    ['zero size', { ...valid, size: [0, 230, 470] }],
    ['huge size', { ...valid, size: [450, 230, 1e9] }],
    ['NaN size', { ...valid, size: [450, NaN, 470] }],
    ['boxes not an array', { ...valid, boxes: {} }],
    ['too many boxes', { ...valid, boxes: Array.from({ length: 601 }, () => valid.boxes[2]) }],
  ])('bails on %s', (_name, raw) => {
    expect(parseCaseLayout(raw)).toBeNull();
  });

  it('drops malformed entries and keeps the rest', () => {
    const l = parseCaseLayout({
      ...valid,
      boxes: [...valid.boxes, { slot: 'gpu' }, null, { slot: 'gpu', role: 'part', min: [0, 0, 'x'], size: [1, 1, 1] }],
      fanSlots: [...valid.fanSlots, { key: '', position: 'x', size: 1, index: 0 }, 5],
    }) as CaseLayout;
    expect(l.boxes).toHaveLength(3);
    expect(l.fanSlots).toHaveLength(4);
  });
});

describe('directions', () => {
  it('defaults rear and top to exhaust and the rest to intake', () => {
    expect(defaultDirection('rear')).toBe('exhaust');
    expect(defaultDirection('top')).toBe('exhaust');
    for (const p of ['front', 'bottom', 'left', 'right', 'psu-shroud', 'front-left', 'front-right']) expect(defaultDirection(p)).toBe('intake');
  });

  it('applies an override and drops it again when it matches the default', () => {
    const slot = { key: 'rear:120:0', position: 'rear' };
    const flipped = withDirection({}, slot, 'intake');
    expect(flipped).toEqual({ 'rear:120:0': 'intake' });
    expect(withDirection(flipped, slot, 'exhaust')).toEqual({});
  });
});

describe('fanGeometries', () => {
  it('pairs fan boxes and ghosts with slots and skips radiators and boxless slots', () => {
    const l = parseCaseLayout(valid) as CaseLayout;
    expect(fanGeometries(l).map(g => g.slot.key)).toEqual(['front:120:0', 'rear:120:0']);
  });
});

describe('slot fields on newer records', () => {
  const withSlots = {
    ...valid,
    fanSlots: [
      { key: 'front:120:0', position: 'front', size: 120, index: 0, taken: 'fan', box: { min: [0, 10, 10], size: [25, 120, 120] }, axis: [2, 0, 0], fan: { airflowCfm: 70, staticPressureMmH2O: 2.1, title: 'F' } },
      { key: 'top:120:0', position: 'top', size: 120, index: 0, taken: null, box: { min: [100, 440, 10], size: [120, 25, 120], rotationY: 0.5 }, axis: [0, -1, 0] },
      { key: 'top:360:0', position: 'top', size: 360, index: 0, taken: 'radiator', radiator: { fanCount: 3, fanAirflowCfm: 60 } },
      { key: 'bad:120:0', position: 'bottom', size: 120, index: 0, taken: null, box: { min: [0, 0, 'x'], size: [1, 1, 1] }, axis: [0, 0, 0], fan: { airflowCfm: -4 } },
    ],
  };

  it('parses boxes, unit axes and specs, and drops invalid ones', () => {
    const l = parseCaseLayout(withSlots) as CaseLayout;
    expect(l.fanSlots[0].axis).toEqual([1, 0, 0]);
    expect(l.fanSlots[0].fan?.airflowCfm).toBe(70);
    expect(l.fanSlots[2].radiator?.fanCount).toBe(3);
    expect(l.fanSlots[3].box).toBeUndefined();
    expect(l.fanSlots[3].axis).toBeUndefined();
    expect(l.fanSlots[3].fan?.airflowCfm).toBeUndefined();
  });

  it('draws empty and taken slots from their own boxes', () => {
    const l = parseCaseLayout(withSlots) as CaseLayout;
    const g = fanGeometries(l);
    expect(g.map(x => x.slot.key)).toEqual(['front:120:0', 'top:120:0']);
    expect(g[1].box.role).toBe('ghost');
    expect(g[1].box.rotationY).toBe(0.5);
  });
});

describe('shaped parts', () => {
  const shaped = {
    ...valid,
    boxes: [
      { slot: 'psu', role: 'part', min: [0, 0, 0], size: [100, 50, 80], chamfers: [{ a: 0, aMax: true, b: 1, bMax: true, legA: 20, legB: 10 }, { a: 1, b: 1, legA: 5, legB: 5 }] },
      { slot: 'gpu', role: 'part', min: [0, 0, 0], size: [10, 10, 10], rings: [{ y: 0, pts: [[0, 0], [5, 0], [5, 5]] }, { y: 10, pts: [[0, 0], [5, 0], [5, 5]] }] },
      { slot: 'psu', role: 'part', min: [0, 0, 0], size: [10, 10, 10], rings: [{ y: 0, pts: [[0, 0], [5, 0], [5, 5]] }, { y: 10, pts: [[0, 0], [5, 0]] }] },
      { slot: 'psu', role: 'part', min: [0, 0, 0], size: [10, 10, 10], faces: [[[0, 0, 0], [1, 0, 0], [1, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 0, 0], [0, 1, 0], [0, 1, 1]], [[1, 0, 0], [1, 1, 0], [1, 1, 1]]] },
    ],
  };

  it('keeps valid chamfers, rings and faces and drops invalid ones', () => {
    const l = parseCaseLayout(shaped) as CaseLayout;
    expect(l.boxes[0].chamfers).toHaveLength(1);
    expect(l.boxes[1].rings).toHaveLength(2);
    expect(l.boxes[2].rings).toBeUndefined();
    expect(l.boxes[3].faces).toHaveLength(4);
  });
});

describe('withBoundFans', () => {
  it('marks bound empty slots as fans, leaves taken and radiator slots alone, and keeps the object when nothing changes', () => {
    const l = parseCaseLayout(valid) as CaseLayout;
    const out = withBoundFans(l, ['rear:120:0', 'front:120:0', 'top:360:0', 'nope']);
    expect(out.fanSlots.find(s => s.key === 'rear:120:0')?.taken).toBe('fan');
    expect(out.fanSlots.find(s => s.key === 'top:360:0')?.taken).toBe('radiator');
    expect(out.fanSlots.find(s => s.key === 'top:120:0')?.taken).toBeNull();
    expect(withBoundFans(l, [])).toBe(l);
    expect(withBoundFans(l, ['front:120:0', 'nope'])).toBe(l);
  });
});

describe('unlinking past the none cap', () => {
  it('starts a second none binding after sixteen keys', () => {
    let b: FanBinding[] = [];
    for (let i = 0; i < 20; i++) b = linkChannelToSlot(b, '', `gpu:fan:${i}`);
    const none = b.filter(x => x.channelId === 'none');
    expect(none.map(x => x.slotKeys.length)).toEqual([16, 4]);
    expect(new Set(none.flatMap(x => x.slotKeys)).size).toBe(20);
  });
});

describe('unlinking at the binding cap', () => {
  it('refuses a marker that would need a binding past the service cap', () => {
    const full = Array.from({ length: 64 }, (_, i) => ({ channelId: `c${i}`, slotKeys: [`s${i}`] }));
    expect(linkChannelToSlot(full, '', 'gpu:fan:0')).toEqual(full);
    // With room for one more binding the marker is stored.
    const roomy = full.slice(0, 63);
    expect(linkChannelToSlot(roomy, '', 'gpu:fan:0')).toEqual([...roomy, { channelId: 'none', slotKeys: ['gpu:fan:0'] }]);
  });
});

describe('linkChannelToSlot', () => {
  it('adds the slot to the channel, takes it off the device it had, and keeps the channel\'s other slots', () => {
    const start = [{ channelId: 'a', slotKeys: ['s1', 's2'] }, { channelId: 'b', slotKeys: ['s3'] }];
    expect(linkChannelToSlot(start, 'b', 's1')).toEqual([{ channelId: 'a', slotKeys: ['s2'] }, { channelId: 'b', slotKeys: ['s3', 's1'] }]);
    expect(linkChannelToSlot([{ channelId: 'a', slotKeys: ['s1'] }], 'a', 's2')).toEqual([{ channelId: 'a', slotKeys: ['s1', 's2'] }]);
  });

  it('changes nothing for a channel already at the per-binding cap', () => {
    const full = [{ channelId: 'a', slotKeys: Array.from({ length: 16 }, (_, i) => `k${i}`) }];
    expect(linkChannelToSlot(full, 'a', 'new')).toEqual(full);
  });

  it('stores the none marker for an unlinked radiator slot too', () => {
    expect(linkChannelToSlot([{ channelId: 'a', slotKeys: ['rad:top:0'] }], '', 'rad:top:0')).toEqual([{ channelId: 'none', slotKeys: ['rad:top:0'] }]);
  });

  it('unlinks a slot with an empty channel id and drops emptied bindings', () => {
    expect(linkChannelToSlot([{ channelId: 'a', slotKeys: ['s1'] }, { channelId: 'b', slotKeys: ['s2'] }], '', 's1')).toEqual([{ channelId: 'b', slotKeys: ['s2'] }]);
  });
});

describe('linkChannelToSlot with simulated fans', () => {
  it('keeps a simulated fan on every slot it was chosen for', () => {
    const one = linkChannelToSlot([], 'sim:1000', 's1');
    const two = linkChannelToSlot(one, 'sim:1000', 's2');
    expect(two).toEqual([{ channelId: 'sim:1000', slotKeys: ['s1', 's2'] }]);
  });

  it('takes the slot off whatever channel held it, real or simulated', () => {
    const start = [{ channelId: 'a', slotKeys: ['s1', 's3'] }, { channelId: 'sim:500', slotKeys: ['s2'] }];
    expect(linkChannelToSlot(start, 'sim:2000', 's1')).toEqual([{ channelId: 'a', slotKeys: ['s3'] }, { channelId: 'sim:500', slotKeys: ['s2'] }, { channelId: 'sim:2000', slotKeys: ['s1'] }]);
    expect(linkChannelToSlot(start, 'a', 's2')).toEqual([{ channelId: 'a', slotKeys: ['s1', 's3', 's2'] }]);
    expect(linkChannelToSlot(start, '', 's2')).toEqual([{ channelId: 'a', slotKeys: ['s1', 's3'] }]);
  });

  it('switches a slot from a simulated fan to a real device without touching the simulated channel\'s other slots', () => {
    const start = [{ channelId: 'sim:1000', slotKeys: ['s1', 's2'] }];
    expect(linkChannelToSlot(start, 'a', 's1')).toEqual([{ channelId: 'sim:1000', slotKeys: ['s2'] }, { channelId: 'a', slotKeys: ['s1'] }]);
  });


  it('regroups a slot by speed, dropping the emptied group and capping new groups at the service limit', () => {
    const start = [{ channelId: 'sim:1000', slotKeys: ['s1'] }];
    expect(linkChannelToSlot(start, 'sim:1100', 's1')).toEqual([{ channelId: 'sim:1100', slotKeys: ['s1'] }]);
    const full = Array.from({ length: 64 }, (_, i) => ({ channelId: `c${i}`, slotKeys: [`k${i}`] }));
    expect(linkChannelToSlot(full, 'sim:900', 'new')).toEqual(full);
  });
});

describe('linkChannelToSlot on a GPU slot', () => {
  it('stores a none marker for no fan linked, merged into one binding, and only for GPU slots', () => {
    const one = linkChannelToSlot([{ channelId: 'gpu-a', slotKeys: ['gpu:fan:0'] }], '', 'gpu:fan:0');
    expect(one).toEqual([{ channelId: 'none', slotKeys: ['gpu:fan:0'] }]);
    expect(linkChannelToSlot(one, '', 'gpu:fan:1')).toEqual([{ channelId: 'none', slotKeys: ['gpu:fan:0', 'gpu:fan:1'] }]);
    expect(linkChannelToSlot([{ channelId: 'a', slotKeys: ['s1'] }], '', 's1')).toEqual([]);
  });

  it('removes the slot from none when any device or simulated fan is chosen', () => {
    const marked = [{ channelId: 'none', slotKeys: ['gpu:fan:0', 'gpu:fan:1'] }];
    expect(linkChannelToSlot(marked, 'gpu-a', 'gpu:fan:0')).toEqual([{ channelId: 'none', slotKeys: ['gpu:fan:1'] }, { channelId: 'gpu-a', slotKeys: ['gpu:fan:0'] }]);
    expect(linkChannelToSlot(marked, 'sim:900', 'gpu:fan:1')).toEqual([{ channelId: 'none', slotKeys: ['gpu:fan:0'] }, { channelId: 'sim:900', slotKeys: ['gpu:fan:1'] }]);
  });
});

describe('radiator fan slots', () => {
  const t1 = t1State as { caseLayout: unknown };
  const layout = parseCaseLayout(t1.caseLayout) as CaseLayout;
  const radFans = (l: CaseLayout) => l.fanSlots.filter(s => s.key.startsWith('rad:'));

  it('keys the T1 360 as rad:0..2, three fans, and gives the covered case slots none', () => {
    expect(radFans(layout).map(s => s.key)).toEqual(['rad:0', 'rad:1', 'rad:2']);
    expect(radFans(layout).every(s => s.position === 'top' && s.taken === 'fan')).toBe(true);
    expect(fanGeometries(layout).filter(g => g.slot.key.startsWith('rad:'))).toHaveLength(3);
    const covered = layout.fanSlots.filter(s => s.taken === 'radiator');
    expect(covered.length).toBeGreaterThan(0);
    expect(covered.flatMap(s => slotModelFans(s, []))).toEqual([]);
    expect(fanGeometries(layout).some(g => g.slot.taken === 'radiator')).toBe(false);
    expect(layout.fanSlots.flatMap(s => slotModelFans(s, [])).filter(f => f.key.startsWith('rad:'))).toHaveLength(3);
  });

  it('still gives three fans when each covered slot states a fan count of 3', () => {
    const raw = t1.caseLayout as { fanSlots: { taken: string; radiator?: object }[] };
    const stated = { ...raw, fanSlots: raw.fanSlots.map(s => (s.taken === 'radiator' ? { ...s, radiator: { ...s.radiator, fanCount: 3 } } : s)) };
    const l = parseCaseLayout(stated) as CaseLayout;
    expect(radFans(l)).toHaveLength(3);
    expect(l.fanSlots.flatMap(s => slotModelFans(s, [])).filter(f => f.key.startsWith('rad:'))).toHaveLength(3);
  });

  it('carries the covered slots\' radiator spec and defaults the direction by position', () => {
    expect(radFans(layout)[0].fan).toMatchObject({ airflowCfm: 90.1, staticPressureMmH2O: 3.97, rpmMax: 2600 });
    expect(slotDirections(radFans(layout), {})).toEqual({ 'rad:0': 'exhaust', 'rad:1': 'exhaust', 'rad:2': 'exhaust' });
  });

  it('lands the default AIO bindings on rad:N', () => {
    const out = withDefaultBindings([], layout.fanSlots, [{ id: 'aio', isAio: true, isGpu: false, kind: 'Fan' }]);
    expect(out.find(b => b.channelId === 'aio')?.slotKeys).toEqual(['rad:0', 'rad:1', 'rad:2']);
  });

  it('never collapses a rad: slot into a case slot, nor the other way round', () => {
    const { layout: out, canonOf } = collapseMounts(layout, []);
    expect(radFans(out).map(s => s.key)).toEqual(['rad:0', 'rad:1', 'rad:2']);
    expect(canonOf('rad:1')).toBe('rad:1');
  });
});

describe('radiator mount choice', () => {
  const y70 = y70Layout as unknown as { boxes: unknown[]; fanSlots: { key: string }[] };
  const topBox = { slot: 'cooler', role: 'part', min: [73, 422.9, 58], size: [360, 52, 120], fans: { axis: 'y', side: 'min', count: 3, diameter: 114, bothSides: true } };
  const rightBox = { slot: 'cooler', role: 'part', min: [27, 69, 245.2], size: [120, 360, 52], fans: { axis: 'z', side: 'min', count: 3, diameter: 114, bothSides: true } };
  const topKeys = ['top:120:0', 'top:120:1', 'top:120:2'];
  const rightKeys = ['right:120:0', 'right:120:1', 'right:120:2'];
  const spec = { title: 'AIO 360', fanAirflowCfm: 70, fanStaticPressureMmH2O: 2.5, fanRpmMax: 2000 };
  const record = (mount: 'top' | 'right') => ({
    ...y70,
    boxes: [...y70.boxes, mount === 'top' ? topBox : rightBox],
    fanSlots: y70.fanSlots.map(s => ({ ...s, taken: (mount === 'top' ? topKeys : rightKeys).includes(s.key) ? 'radiator' : null, ...(topKeys.includes(s.key) || rightKeys.includes(s.key) ? { radiator: spec } : {}) })),
    radiatorMount: mount,
    radiatorOptions: [
      { mount: 'top', box: topBox, radiator: topKeys, fans: [] },
      { mount: 'right', box: rightBox, radiator: rightKeys, fans: ['top:120:0'] },
    ],
  });
  const slot = (l: CaseLayout, key: string) => l.fanSlots.find(s => s.key === key);

  it('leaves the record as resolved without a choice or when the choice is its own mount', () => {
    for (const choice of [undefined, null, 'top', 'bogus']) {
      const l = parseCaseLayout(record('top'), choice) as CaseLayout;
      expect(l.radiatorMount).toBe('top');
      expect(l.radiatorMove).toBeUndefined();
      expect(topKeys.every(k => slot(l, k)?.taken === 'radiator')).toBe(true);
    }
    expect((parseCaseLayout(record('top')) as CaseLayout).radiatorOptions?.map(o => o.mount)).toEqual(['top', 'right']);
  });

  it('moves the radiator to the right: covers right slots, sets top slots per option.fans, puts rad:N on the right as intake', () => {
    const l = parseCaseLayout(record('top'), 'right') as CaseLayout;
    expect(l.radiatorMount).toBe('right');
    expect(rightKeys.every(k => slot(l, k)?.taken === 'radiator')).toBe(true);
    expect(slot(l, 'top:120:0')?.taken).toBe('fan');
    expect(slot(l, 'top:120:1')?.taken).toBeNull();
    expect(slot(l, 'top:120:2')?.taken).toBeNull();
    const rad = l.fanSlots.filter(s => s.key.startsWith('rad:'));
    expect(rad.map(s => s.key)).toEqual(['rad:0', 'rad:1', 'rad:2']);
    expect(rad.every(s => s.position === 'right' && s.axis?.join() === '0,0,-1')).toBe(true);
    expect(slotDirections(rad, {})).toEqual({ 'rad:0': 'intake', 'rad:1': 'intake', 'rad:2': 'intake' });
    expect(rad[0].fan).toMatchObject({ airflowCfm: 70 });
    expect(l.radiatorMove).toEqual({ from: expect.objectContaining({ min: topBox.min }), to: expect.objectContaining({ min: rightBox.min }) });
  });

  it('keeps rad:N bindings and drives nothing from a binding on a covered case slot', () => {
    const l = parseCaseLayout(record('top'), 'right') as CaseLayout;
    const bindings = [{ channelId: 'aio', slotKeys: ['rad:0', 'rad:1'] }, { channelId: 'fan-9', slotKeys: ['right:120:1'] }];
    const effective = withDefaultBindings(bindings, l.fanSlots, []);
    expect(effective.find(b => b.channelId === 'aio')?.slotKeys).toEqual(['rad:0', 'rad:1']);
    const speeds = slotSpeeds(l.fanSlots, bindings, [{ id: 'aio', rpm: 1000, dutyPercent: 50 }, { id: 'fan-9', rpm: 1000, dutyPercent: 50 }]);
    expect(speeds.has('right:120:1')).toBe(false);
    expect(speeds.has('rad:1')).toBe(true);
    expect(l.fanSlots.flatMap(s => slotModelFans(s, [])).map(f => f.key).filter(k => k.startsWith('right:'))).toEqual([]);
  });

  it('drops malformed options and shows none below two', () => {
    const raw = record('top');
    expect((parseCaseLayout({ ...raw, radiatorOptions: [raw.radiatorOptions[0], { mount: 'right' }] }) as CaseLayout).radiatorOptions).toBeUndefined();
  });

  it('reads the radiator spec, not the fan spec, from a covered slot that carries both', () => {
    const base = record('top');
    const both = { ...base, fanSlots: base.fanSlots.map(s => (topKeys.includes(s.key) ? { ...s, fan: { rpmMax: 999, airflowCfm: 11 }, radiator: { ...spec } } : s)) };
    const l = parseCaseLayout(both) as CaseLayout;
    const rad = l.fanSlots.filter(s => s.key.startsWith('rad:'));
    expect(rad.every(s => s.fan?.rpmMax === 2000 && s.fan?.airflowCfm === 70)).toBe(true);
    const moved = parseCaseLayout(both, 'right') as CaseLayout;
    expect(moved.fanSlots.find(s => s.key === 'top:120:0')?.taken).toBe('fan');
    const covered = moved.fanSlots.find(s => s.key === 'right:120:0')!;
    expect(covered.taken).toBe('radiator');
    const speeds = slotSpeeds([{ ...covered, fan: { rpmMax: 999 }, radiator: { fanRpmMax: 2000 } }, ...moved.fanSlots.filter(s => s.key.startsWith('rad:'))], [{ channelId: 'aio', slotKeys: ['rad:0', 'right:120:0'] }], [{ id: 'aio', rpm: 1000, dutyPercent: 50 }]);
    expect(speeds.get('rad:0')?.fraction).toBeCloseTo(0.5);
    expect(speeds.has('right:120:0')).toBe(false);
  });

  it('gives a fanless radiator no rad:N slots, and still moves it', () => {
    const bare = { slot: topBox.slot, role: topBox.role, min: topBox.min, size: topBox.size };
    const bareRight = { slot: rightBox.slot, role: rightBox.role, min: rightBox.min, size: rightBox.size };
    const raw = { ...record('top'), boxes: [...y70.boxes, bare], radiatorOptions: [{ mount: 'top', box: bare, radiator: topKeys, fans: [] }, { mount: 'right', box: bareRight, radiator: rightKeys, fans: [] }] };
    const l = parseCaseLayout(raw) as CaseLayout;
    expect(l.fanSlots.some(s => s.key.startsWith('rad:'))).toBe(false);
    const moved = parseCaseLayout(raw, 'right') as CaseLayout;
    expect(moved.radiatorMove?.to.min).toEqual(rightBox.min);
    expect(rightKeys.every(k => slot(moved, k)?.taken === 'radiator')).toBe(true);
    expect(moved.fanSlots.some(s => s.key.startsWith('rad:'))).toBe(false);
  });

  it('keeps one rad:N per face position for a push-pull radiator, whatever the maker total', () => {
    const base = record('top');
    const pushPull = { ...base, fanSlots: base.fanSlots.map(s => (topKeys.includes(s.key) ? { ...s, radiator: { ...spec, fanCount: 6 } } : s)) };
    const l = parseCaseLayout(pushPull) as CaseLayout;
    expect(l.fanSlots.filter(s => s.key.startsWith('rad:'))).toHaveLength(3);
    const single = { slot: 'cooler', role: 'part', min: [73, 422.9, 58], size: [120, 52, 120], fans: { axis: 'y', side: 'min', count: 1, diameter: 114, bothSides: true } };
    const two = parseCaseLayout({ ...base, boxes: [...y70.boxes, single], fanSlots: base.fanSlots.map(s => (s.key === 'top:120:0' ? { ...s, radiator: { ...spec, fanCount: 2 } } : s)), radiatorOptions: undefined }) as CaseLayout;
    expect(two.fanSlots.filter(s => s.key.startsWith('rad:')).map(s => s.key)).toEqual(['rad:0']);
  });

  it('sums the static pressure of a push-pull position, whose maker total is twice the fans per face', () => {
    const base = record('top');
    const withTotal = (fanCount: number) => (parseCaseLayout({ ...base, fanSlots: base.fanSlots.map(s => (topKeys.includes(s.key) ? { ...s, radiator: { ...spec, fanCount } } : s)) }) as CaseLayout).fanSlots.find(s => s.key === 'rad:0')?.fan;
    expect(withTotal(3)).toMatchObject({ airflowCfm: 70, staticPressureMmH2O: 2.5 });
    expect(withTotal(6)).toMatchObject({ airflowCfm: 70, staticPressureMmH2O: 5 });
  });

  it('finds a fanless radiator box whose raw coordinates differ from the rounded option box at the second decimal', () => {
    const bare = { slot: topBox.slot, role: topBox.role, min: [73, 422.9, 58], size: [360, 52, 120] };
    const raw = { slot: topBox.slot, role: topBox.role, min: [73.02, 422.93, 58.01], size: [360.02, 51.97, 120] };
    const bareRight = { slot: rightBox.slot, role: rightBox.role, min: rightBox.min, size: rightBox.size };
    const rec = { ...record('top'), boxes: [...y70.boxes, raw], radiatorOptions: [{ mount: 'top', box: bare, radiator: topKeys, fans: [] }, { mount: 'right', box: bareRight, radiator: rightKeys, fans: [] }] };
    const moved = parseCaseLayout(rec, 'right') as CaseLayout;
    expect(moved.radiatorMove?.from.min).toEqual(raw.min);
    expect(moved.boxes.some(b => b.min[1] === 422.93)).toBe(false);
  });
});

describe('AIO hoses', () => {
  const y70 = y70Layout as unknown as { boxes: unknown[]; fanSlots: unknown[] };
  const topBox = { slot: 'cooler', role: 'part', min: [73, 422.9, 58], size: [360, 52, 120] };
  const rightBox = { slot: 'cooler', role: 'part', min: [27, 69, 245.2], size: [120, 360, 52] };
  const tube = (z: number) => ({ radius: 6, points: [[100, 300, z], [100, 325, z], [43, 440, z + 20], [73, 449, z + 20]] });
  const hoseLine = (z: number) => ({ slot: 'cooler', role: 'part', ...tube(z) });
  const raw = {
    ...y70,
    radiatorMount: 'top',
    lines: [hoseLine(60), hoseLine(90), { slot: 'cooler', role: 'detail', points: [[0, 0, 0], [1, 1, 1]] }],
    radiatorOptions: [
      { mount: 'top', box: topBox, radiator: [], fans: [], tubes: [tube(60), tube(90)] },
      { mount: 'right', box: rightBox, radiator: [], fans: [], tubes: [tube(10), tube(20)] },
    ],
  };

  it('reads the resolved mount\'s hoses from the record\'s lines, skipping hairlines', () => {
    const l = parseCaseLayout(raw) as CaseLayout;
    expect(l.tubes).toHaveLength(2);
    expect(l.tubes![0].radius).toBe(6);
  });

  it('takes the chosen mount\'s hoses when the radiator moves', () => {
    const l = parseCaseLayout(raw, 'right') as CaseLayout;
    expect(l.tubes!.map(t => t.points[0][2])).toEqual([10, 20]);
  });

  it('draws none for a moved radiator whose option carries no hoses, and for a record without any', () => {
    const noTubes = { ...raw, radiatorOptions: raw.radiatorOptions.map(o => ({ mount: o.mount, box: o.box, radiator: o.radiator, fans: o.fans })) };
    expect((parseCaseLayout(noTubes, 'right') as CaseLayout).tubes).toBeUndefined();
    expect((parseCaseLayout({ ...noTubes, lines: [] }) as CaseLayout).tubes).toBeUndefined();
  });

  it('keeps a moved radiator\'s hose that is routed through many points', () => {
    const dense = { radius: 6, points: Array.from({ length: 100 }, (_, i) => [i, 300 + i, 10]) };
    const l = parseCaseLayout({ ...raw, radiatorOptions: [raw.radiatorOptions[0], { ...raw.radiatorOptions[1], tubes: [dense, dense] }] }, 'right') as CaseLayout;
    expect(l.tubes!.map(t => t.points.length)).toEqual([100, 100]);
  });

  it('drops malformed hoses', () => {
    const bad = { ...raw, lines: [{ radius: -1, points: [[0, 0, 0], [1, 1, 1]] }, { radius: 6, points: [[0, 0, 0]] }, { radius: 6, points: [[0, 0, 'x'], [1, 1, 1]] }] };
    expect((parseCaseLayout(bad) as CaseLayout).tubes).toBeUndefined();
  });
});
