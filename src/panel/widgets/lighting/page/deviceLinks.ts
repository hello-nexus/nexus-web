import type { LightingDevice } from '../../../../api/lighting';
import { groupOf, newGroupId, type DeviceGroup } from '../../../../lib/deviceGroups';
import { blockKey, type DeviceBlock } from './deviceBlocks';

// Linked cards share one canvas frame and one selection: they move, resize
// and rotate as one and are always selected together. A link is stored with
// the group shape (id, name, members); a card is in at most one link.
export type DeviceLink = DeviceGroup;

/** The link holding `id`, or null. */
export function linkOf(links: readonly DeviceLink[], id: string): DeviceLink | null {
  return links.find(l => l.members.includes(id)) ?? null;
}

/** Every card linked with `id`, itself included; just `[id]` when unlinked. */
export function linkedWith(links: readonly DeviceLink[], id: string): string[] {
  return linkOf(links, id)?.members ?? [id];
}

/** `ids` plus every card linked to one of them. */
export function withLinked(links: readonly DeviceLink[], ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) for (const m of linkedWith(links, id)) out.add(m);
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
export function canLink(blocks: readonly DeviceBlock[], groups: readonly DeviceGroup[], ids: readonly string[]): boolean {
  if (new Set(ids).size < 2) return false;
  const rows = ids.map(id => rowOfDevice(blocks, groups, id));
  const first = rows[0];
  return first !== undefined && rows.every(r => r !== undefined && r.container === first.container);
}

/** Links `ids` as one set, taking each out of any link it was in. `name` is the header the frame carries, if any. */
export function linkDevices(links: readonly DeviceLink[], ids: readonly string[], name = ''): DeviceLink[] {
  const members = [...new Set(ids)];
  if (members.length < 2) return [...links];
  return [...unlinkDevices(links, members), { id: newGroupId(), name, members }];
}

/** Takes `ids` out of their links; a link left with one card dissolves. */
export function unlinkDevices(links: readonly DeviceLink[], ids: readonly string[]): DeviceLink[] {
  const gone = new Set(ids);
  return links
    .map(l => ({ ...l, members: l.members.filter(m => !gone.has(m)) }))
    .filter(l => l.members.length >= 2);
}

/** Whether every one of `ids` sits in one link that holds nothing else. */
export function isLinkedSet(links: readonly DeviceLink[], ids: readonly string[]): boolean {
  if (ids.length < 2) return false;
  const link = linkOf(links, ids[0]);
  return link !== null && link.members.length === new Set(ids).size && ids.every(id => link.members.includes(id));
}

/** The frame that stands for `device` on the canvas: the first linked member the canvas draws, or itself. */
export function frameOwner(links: readonly DeviceLink[], drawn: readonly LightingDevice[], device: LightingDevice): string {
  const link = linkOf(links, device.id);
  if (!link) return device.id;
  return drawn.find(d => link.members.includes(d.id))?.id ?? device.id;
}
