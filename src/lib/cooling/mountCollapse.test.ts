import { describe, expect, it } from 'vitest';
import { channelOfSlot, collapseMounts, normalizeBindings, parseCaseLayout, linkChannelToSlot, type CaseLayout } from './caseLayout';
import { Y70_FAN_SLOTS, Y70_SIZE } from './y70Slots.fixture';

const layout = parseCaseLayout({ size: Y70_SIZE, boxes: [], fanSlots: Y70_FAN_SLOTS }) as CaseLayout;
// The bindings T1 held when the doubled fans were reported.
const T1_BINDINGS = [
  { channelId: '/lpc/it8696e/0/control/1', slotKeys: ['right:120:1'] },
  { channelId: '/lpc/it8696e/0/control/0', slotKeys: ['right:120:2'] },
  { channelId: '/gpu-nvidia/0/control/1', slotKeys: ['top:140:0'] },
  { channelId: '/gpu-nvidia/0/control/2', slotKeys: ['top:120:2'] },
  { channelId: '/lpc/it8696e/0/control/2', slotKeys: ['top:120:0', 'bottom:120:0', 'bottom:120:1', 'top:120:1'] },
];
const boundOf = (b: typeof T1_BINDINGS) => b.flatMap(x => x.slotKeys);
const fans = (l: CaseLayout) => l.fanSlots.filter(s => s.taken === 'fan');

describe('the Y70 slot data', () => {
  it('has 16 empty slots with 120 and 140 mm alternatives overlapping at the same mounts', () => {
    expect(layout.fanSlots).toHaveLength(16);
    expect(layout.fanSlots.every(s => s.taken === null)).toBe(true);
    const a = layout.fanSlots.find(s => s.key === 'top:120:1')!.box!;
    const b = layout.fanSlots.find(s => s.key === 'top:140:0')!.box!;
    expect(a.min[0] < b.min[0] + b.size[0] && b.min[0] < a.min[0] + a.size[0]).toBe(true);
  });
});

const perFace = (l: CaseLayout) => {
  const out: Record<string, number> = {};
  for (const s of l.fanSlots) out[s.position] = (out[s.position] ?? 0) + 1;
  return out;
};

function noOverlaps(l: CaseLayout) {
  for (let i = 0; i < l.fanSlots.length; i++) for (let j = i + 1; j < l.fanSlots.length; j++) {
    const a = l.fanSlots[i], b = l.fanSlots[j];
    if (a.position !== b.position) continue;
    const axis = a.box!.size.indexOf(Math.min(...a.box!.size));
    const span = [0, 1, 2].filter(k => k !== axis).map(k => Math.min(a.box!.min[k] + a.box!.size[k], b.box!.min[k] + b.box!.size[k]) - Math.max(a.box!.min[k], b.box!.min[k]));
    expect(span.every(v => v > 0.05)).toBe(false);
  }
}

describe('collapseMounts on the Y70', () => {
  // The Y70 holds two 140 mm or three 120 mm fans on top and on the right, two 140 mm (or two 120 mm) on the bottom, and one on the rear.
  it('with nothing installed or bound, shows the larger size: 2 top, 2 right, 2 bottom, 1 rear', () => {
    const { layout: out } = collapseMounts(layout, []);
    expect(perFace(out)).toEqual({ top: 2, right: 2, bottom: 2, rear: 1 });
    expect(out.fanSlots.map(s => s.key).sort()).toEqual(['bottom:140:0', 'bottom:140:1', 'rear:140:0', 'right:140:0', 'right:140:1', 'top:140:0', 'top:140:1']);
    expect(fans(out)).toHaveLength(0);
    noOverlaps(out);
  });

  it('with the T1 bindings, draws 2 top, 3 right, 2 bottom, 1 rear, six of them fans, and no two overlap', () => {
    const { layout: out, canonOf } = collapseMounts(layout, boundOf(T1_BINDINGS));
    expect(perFace(out)).toEqual({ top: 2, right: 3, bottom: 2, rear: 1 });
    expect(fans(out).map(s => s.key).sort()).toEqual(['bottom:120:0', 'bottom:120:1', 'right:120:1', 'right:120:2', 'top:120:2', 'top:140:0']);
    expect(canonOf('top:120:1')).toBe('top:140:0');
    expect(canonOf('top:120:0')).toBe('top:140:0');
    noOverlaps(out);
  });

  it('hides both 120 mm slots a 140 mm one overlaps, and maps each to it', () => {
    const { layout: out, canonOf } = collapseMounts(layout, ['top:140:0']);
    const keys = out.fanSlots.filter(s => s.position === 'top').map(s => s.key);
    expect(keys).toContain('top:140:0');
    expect(keys).not.toContain('top:120:0');
    expect(keys).not.toContain('top:120:1');
    expect(canonOf('top:120:0')).toBe('top:140:0');
    expect(canonOf('top:120:1')).toBe('top:140:0');
  });

  it('keeps an installed fan over a bigger alternative at the same mount', () => {
    const installed = { ...layout, fanSlots: layout.fanSlots.map(s => (s.key === 'top:120:1' ? { ...s, taken: 'fan' as const } : s)) };
    const { layout: out } = collapseMounts(installed, ['top:140:0']);
    const keys = out.fanSlots.map(s => s.key);
    expect(keys).toContain('top:120:1');
    expect(keys).not.toContain('top:140:0');
    noOverlaps(out);
  });
});

describe('binding a device', () => {
  it('links the drawn fan and adds no fan or slot', () => {
    const before = collapseMounts(layout, boundOf(T1_BINDINGS));
    const next = linkChannelToSlot(normalizeBindings(T1_BINDINGS, before.canonOf), '/lpc/it8696e/0/control/4', 'right:120:1');
    const after = collapseMounts(layout, next.flatMap(b => b.slotKeys));
    expect(after.layout.fanSlots.length).toBe(before.layout.fanSlots.length);
    expect(fans(after.layout).length).toBe(fans(before.layout).length);
    expect(channelOfSlot(normalizeBindings(next, after.canonOf), 'right:120:1')).not.toBeNull();
  });

  it('pointed at an alternative size of a drawn mount, lands on the drawn slot', () => {
    const before = collapseMounts(layout, boundOf(T1_BINDINGS));
    const hidden = layout.fanSlots.find(s => s.key === 'top:120:1')!.key;
    expect(before.canonOf(hidden)).toBe('top:140:0');
    const next = linkChannelToSlot(normalizeBindings(T1_BINDINGS, before.canonOf), '/lpc/it8696e/0/control/4', hidden);
    const after = collapseMounts(layout, next.flatMap(b => b.slotKeys));
    expect(fans(after.layout).length).toBe(fans(before.layout).length);
  });

  it('merges a binding that named two alternatives of one mount into one drawn slot', () => {
    const { canonOf } = collapseMounts(layout, boundOf(T1_BINDINGS));
    const n = normalizeBindings([{ channelId: 'c', slotKeys: ['top:120:1', 'top:140:0'] }], canonOf);
    expect(n[0].slotKeys).toEqual(['top:140:0']);
  });
});
