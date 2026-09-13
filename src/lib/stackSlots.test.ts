import { describe, expect, it } from 'vitest';
import { sliceStackSlot, stackSlotOf, type StackSlot } from './stackSlots';

const frame = { x: 0, y: 0, w: 300, h: 100 };
const slot = (layout: StackSlot['layout'], index: number, count: number): StackSlot => ({ layout, index, count });

describe('sliceStackSlot', () => {
  it('leaves a lone member on the whole frame', () => {
    expect(sliceStackSlot(frame, slot('parallel', 0, 1))).toEqual(frame);
  });

  it('cuts parallel bands top to bottom and series columns left to right', () => {
    expect(sliceStackSlot(frame, slot('parallel', 1, 2))).toEqual({ x: 0, y: 50, w: 300, h: 50 });
    expect(sliceStackSlot(frame, slot('series', 2, 3))).toEqual({ x: 200, y: 0, w: 100, h: 100 });
  });
});

describe('stackSlotOf', () => {
  const stacks = [
    { id: 's1', name: '', members: ['a', 'b', 'c'], layout: 'series' as const },
    { id: 's2', name: '', members: ['d', 'e'] },
    { id: 's3', name: '', members: ['f', 'g'], layout: 'mirrored' as unknown as 'overlap' },
  ];

  it('names a laid-out member\'s slot and nothing for overlapping, unknown or unstacked cards', () => {
    expect(stackSlotOf(stacks, 'b')).toEqual({ layout: 'series', index: 1, count: 3 });
    expect(stackSlotOf(stacks, 'd')).toBeNull();
    expect(stackSlotOf(stacks, 'f')).toBeNull();
    expect(stackSlotOf(stacks, 'z')).toBeNull();
    expect(stackSlotOf(undefined, 'a')).toBeNull();
  });
});
