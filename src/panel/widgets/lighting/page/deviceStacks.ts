import { groupOf, newGroupId, type DeviceGroup } from '../../../../lib/deviceGroups';
import { blockKey, type DeviceBlock } from './deviceBlocks';

// Stacked cards share one canvas frame and one selection: they move, resize
// and rotate as one and are always selected together. A stack is stored with
// the group shape (id, name, members); a card is in at most one stack.
export type DeviceStack = DeviceGroup;

/** The stack holding `id`, or null. */
export function stackOf(stacks: readonly DeviceStack[], id: string): DeviceStack | null {
  return stacks.find(l => l.members.includes(id)) ?? null;
}

/** Every card stacked with `id`, itself included; just `[id]` when unstacked. */
export function stackedWith(stacks: readonly DeviceStack[], id: string): string[] {
  return stackOf(stacks, id)?.members ?? [id];
}

/** `ids` plus every card stacked to one of them. */
export function withStacked(stacks: readonly DeviceStack[], ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) for (const m of stackedWith(stacks, id)) out.add(m);
  return out;
}

/**
 * The rail row a device is - its card, or the stack its zones share - and the
 * container that row sits in: the top level (null), a user group, or the
 * hardware group whose rows it is one of.
 */
export function rowOfDevice(
  blocks: readonly DeviceBlock[],
  groups: readonly DeviceGroup[],
  deviceId: string,
): { rowId: string; container: string | null; hardware: string | null } | undefined {
  for (const block of blocks) {
    const members = block.kind === 'single' ? [block.device] : block.devices;
    if (!members.some(d => d.id === deviceId)) continue;
    const key = blockKey(block);
    if (block.kind !== 'group') return { rowId: key, container: groupOf(groups, key)?.id ?? null, hardware: null };
    const row = block.blocks.find(z => (z.kind === 'single' ? [z.device] : z.devices).some(d => d.id === deviceId));
    if (!row) return undefined;
    const rowId = blockKey(row);
    return { rowId, container: groupOf(groups, rowId)?.id ?? key, hardware: key };
  }
  return undefined;
}

/** True when `ids` name at least two cards whose rows all sit in one container. */
export function canStack(blocks: readonly DeviceBlock[], groups: readonly DeviceGroup[], ids: readonly string[]): boolean {
  if (new Set(ids).size < 2) return false;
  const rows = ids.map(id => rowOfDevice(blocks, groups, id));
  const first = rows[0];
  return first !== undefined && rows.every(r => r !== undefined && r.container === first.container);
}

/** Stacks `ids` as one set, taking each out of any stack it was in. `name` is the header the frame carries, if any. */
export function stackDevices(stacks: readonly DeviceStack[], ids: readonly string[], name = ''): DeviceStack[] {
  const members = [...new Set(ids)];
  if (members.length < 2) return [...stacks];
  return [...unstackDevices(stacks, members), { id: newGroupId(), name, members }];
}

/** Takes `ids` out of their stacks; a stack left with one card dissolves. */
export function unstackDevices(stacks: readonly DeviceStack[], ids: readonly string[]): DeviceStack[] {
  const gone = new Set(ids);
  return stacks
    .map(l => ({ ...l, members: l.members.filter(m => !gone.has(m)) }))
    .filter(l => l.members.length >= 2);
}

/** Whether every one of `ids` sits in one stack that holds nothing else. */
export function isStackedSet(stacks: readonly DeviceStack[], ids: readonly string[]): boolean {
  if (ids.length < 2) return false;
  const stack = stackOf(stacks, ids[0]);
  return stack !== null && stack.members.length === new Set(ids).size && ids.every(id => stack.members.includes(id));
}
