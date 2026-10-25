import { describe, expect, it } from 'vitest';
import {
  channelOfSlot, withBoundFans, defaultDirection, directionOf, fanGeometries, parseCaseLayout, slotsOfChannel, toggleBinding, withDirection,
  type CaseLayout,
} from './caseLayout';

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
    expect(directionOf(slot, flipped)).toBe('intake');
    expect(withDirection(flipped, slot, 'exhaust')).toEqual({});
  });
});

describe('toggleBinding', () => {
  it('binds, adds and unbinds slots of one channel', () => {
    let b = toggleBinding([], 'fan1', 'a');
    b = toggleBinding(b, 'fan1', 'b');
    expect(b).toEqual([{ channelId: 'fan1', slotKeys: ['a', 'b'] }]);
    b = toggleBinding(b, 'fan1', 'a');
    expect(b).toEqual([{ channelId: 'fan1', slotKeys: ['b'] }]);
    b = toggleBinding(b, 'fan1', 'b');
    expect(b).toEqual([]);
  });

  it('moves a slot from one channel to another', () => {
    const b = toggleBinding([{ channelId: 'fan1', slotKeys: ['a'] }], 'fan2', 'a');
    expect(b).toEqual([{ channelId: 'fan2', slotKeys: ['a'] }]);
    expect(channelOfSlot(b, 'a')).toBe('fan2');
    expect(slotsOfChannel(b, 'fan2')).toEqual(['a']);
    expect(slotsOfChannel(b, null)).toEqual([]);
  });

  it('caps the slots per channel', () => {
    let b: ReturnType<typeof toggleBinding> = [];
    for (let i = 0; i < 20; i++) b = toggleBinding(b, 'fan1', `k${i}`);
    expect(b[0].slotKeys).toHaveLength(16);
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
