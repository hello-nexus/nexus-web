import type { DeviceGroup } from './deviceGroups';

/** How a stack's members share the one frame they all carry. */
export type StackLayout = 'overlap' | 'parallel' | 'series';

export const STACK_LAYOUTS: readonly StackLayout[] = ['overlap', 'parallel', 'series'];

/** A stack as the service stores it: the group shape plus how the frame is shared. Absent means overlap. */
export type DeviceStack = DeviceGroup & { layout?: StackLayout };

// A word this build does not know (a stack saved by another build) reads as the default.
export const stackLayoutOf = (stack: DeviceStack): StackLayout => STACK_LAYOUTS.find(l => l === stack.layout) ?? 'overlap';

/** One member's place in a laid-out stack. */
export interface StackSlot { layout: Exclude<StackLayout, 'overlap'>; index: number; count: number }

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * The part of the unturned frame a slot samples: parallel cuts equal bands top
 * to bottom, series equal columns left to right; the frame's rotation then
 * turns the slots with it. Mirrors the service's StackSlots.Slice
 * (nexus-service/src/Lighting/StackSlots.cs), which samples the engine the same
 * way. Change them together.
 */
export function sliceStackSlot(rect: Rect, slot: StackSlot): Rect {
  if (slot.count < 2) return rect;
  const share = 1 / slot.count;
  return slot.layout === 'parallel'
    ? { x: rect.x, y: rect.y + slot.index * share * rect.h, w: rect.w, h: share * rect.h }
    : { x: rect.x + slot.index * share * rect.w, y: rect.y, w: share * rect.w, h: rect.h };
}

/** The slot `id` holds in its stack, or null when it is unstacked or the stack overlaps. */
export function stackSlotOf(stacks: readonly DeviceStack[] | undefined, id: string): StackSlot | null {
  const stack = stacks?.find(s => s.members.includes(id));
  if (!stack || stack.members.length < 2) return null;
  const layout = stackLayoutOf(stack);
  if (layout === 'overlap') return null;
  return { layout, index: stack.members.indexOf(id), count: stack.members.length };
}
