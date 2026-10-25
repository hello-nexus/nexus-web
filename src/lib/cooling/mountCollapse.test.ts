import { describe, expect, it } from 'vitest';
import { channelOfSlot, collapseMounts, normalizeBindings, parseCaseLayout, toggleBinding, type CaseLayout } from './caseLayout';
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

describe('collapseMounts on the Y70', () => {
  it('shows one slot per physical mount, the larger size when nothing is installed or bound', () => {
    const { layout: out } = collapseMounts(layout, []);
    const keys = out.fanSlots.map(s => s.key).sort();
    expect(out.fanSlots.length).toBeLessThan(16);
    expect(keys).toContain('top:140:0');
    expect(keys).not.toContain('top:120:1');
    expect(fans(out)).toHaveLength(0);
    for (const pos of ['top', 'right', 'bottom', 'rear']) {
      const slots = out.fanSlots.filter(s => s.position === pos);
      for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i].box!, b = slots[j].box!;
        const ox = Math.min(a.min[0] + a.size[0], b.min[0] + b.size[0]) - Math.max(a.min[0], b.min[0]);
        const oy = Math.min(a.min[1] + a.size[1], b.min[1] + b.size[1]) - Math.max(a.min[1], b.min[1]);
        const oz = Math.min(a.min[2] + a.size[2], b.min[2] + b.size[2]) - Math.max(a.min[2], b.min[2]);
        const share = ox > 0 && oy > 0 && oz > 0 ? (ox * oy * oz) / Math.min(a.size[0] * a.size[1] * a.size[2], b.size[0] * b.size[1] * b.size[2]) : 0;
        expect(share).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('draws one fan per mount that holds a bound device, the bound size winning', () => {
    const { layout: out, canonOf } = collapseMounts(layout, boundOf(T1_BINDINGS));
    const keys = fans(out).map(s => s.key);
    expect(keys).toContain('top:140:0');
    expect(keys).not.toContain('top:120:1');
    expect(keys).toContain('top:120:0');
    expect(canonOf('top:120:1')).toBe('top:140:0');
    expect(new Set(keys).size).toBe(keys.length);
    // No two drawn fans share a mount: neighbours are a whole fan apart, not stacked.
    const tops = fans(out).filter(s => s.position === 'top').map(s => s.box!.min[0]);
    expect(Math.min(...tops.flatMap((a, i) => tops.slice(i + 1).map(b => Math.abs(a - b))))).toBeGreaterThan(90);
  });

  it('keeps an installed fan over a bigger alternative at the same mount', () => {
    const installed = { ...layout, fanSlots: layout.fanSlots.map(s => (s.key === 'top:120:1' ? { ...s, taken: 'fan' as const } : s)) };
    const { layout: out } = collapseMounts(installed, ['top:140:0']);
    const keys = out.fanSlots.map(s => s.key);
    expect(keys).toContain('top:120:1');
    expect(keys).not.toContain('top:140:0');
  });
});

describe('binding a device', () => {
  it('links the drawn fan and adds no fan or slot', () => {
    const before = collapseMounts(layout, boundOf(T1_BINDINGS));
    const next = toggleBinding(normalizeBindings(T1_BINDINGS, before.canonOf), '/lpc/it8696e/0/control/4', 'right:120:1');
    const after = collapseMounts(layout, next.flatMap(b => b.slotKeys));
    expect(after.layout.fanSlots.length).toBe(before.layout.fanSlots.length);
    expect(fans(after.layout).length).toBe(fans(before.layout).length);
    expect(channelOfSlot(normalizeBindings(next, after.canonOf), 'right:120:1')).not.toBeNull();
  });

  it('pointed at an alternative size of a drawn mount, lands on the drawn slot', () => {
    const before = collapseMounts(layout, boundOf(T1_BINDINGS));
    const hidden = layout.fanSlots.find(s => s.key === 'top:120:1')!.key;
    expect(before.canonOf(hidden)).toBe('top:140:0');
    const next = toggleBinding(normalizeBindings(T1_BINDINGS, before.canonOf), '/lpc/it8696e/0/control/4', hidden);
    const after = collapseMounts(layout, next.flatMap(b => b.slotKeys));
    expect(fans(after.layout).length).toBe(fans(before.layout).length);
  });

  it('merges a binding that named two alternatives of one mount into one drawn slot', () => {
    const { canonOf } = collapseMounts(layout, boundOf(T1_BINDINGS));
    const n = normalizeBindings([{ channelId: 'c', slotKeys: ['top:120:1', 'top:140:0'] }], canonOf);
    expect(n[0].slotKeys).toEqual(['top:140:0']);
  });
});
