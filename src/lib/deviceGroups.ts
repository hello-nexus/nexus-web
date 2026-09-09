// User-made groups on the lighting and cooling rails. Both pages already build
// their own intrinsic blocks (a card, or a hardware group like a motherboard's
// headers); these helpers layer the user's grouping over whatever those are, so
// the two pages share one model, one cap and one set of drag rules.

/** Mirrors DeviceGroupList.MaxGroups in nexus-service; the service caps too. */
export const MAX_DEVICE_GROUPS = 10;

/** Name cap, matching the rename field on cards and group headers. */
export const GROUP_NAME_MAX = 20;

export interface DeviceGroup {
  id: string;
  name: string;
  /** Ids of the blocks in this group, in display order. */
  members: string[];
  /** Id of the rail row this group sits after; '' pins it to the top and
   *  null/absent means never placed, which tails it. Anchoring to the first
   *  member cannot hold an emptied group in place, so the rail order the user
   *  last dropped is stored instead. */
  after?: string | null;
}

/** One rail row: an ungrouped block, or a user group holding blocks. */
export type GroupedRow<B> =
  | { kind: 'block'; id: string; block: B }
  | { kind: 'group'; id: string; group: DeviceGroup; blocks: B[] };

export function newGroupId(): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return `grp-${rand}`;
}

/**
 * The rail's rows. A group sits after the row its anchor names, or, with no
 * anchor, where its first present member sits in block order, so a group and an
 * ungrouped block interleave the way two blocks do. A group whose members are
 * all absent (hardware unplugged) still renders, empty, so the user can see it
 * and drop into it.
 */
export function groupedRows<B>(
  blocks: readonly B[],
  idOf: (block: B) => string,
  groups: readonly DeviceGroup[],
): GroupedRow<B>[] {
  const byId = new Map(blocks.map(b => [idOf(b), b]));
  const owner = new Map<string, string>();
  for (const group of groups) {
    for (const member of group.members) {
      if (!owner.has(member)) owner.set(member, group.id);
    }
  }

  const rows: GroupedRow<B>[] = [];
  const placed = new Set<string>();
  const emit = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || placed.has(groupId)) return;
    placed.add(groupId);
    rows.push({
      kind: 'group',
      id: groupId,
      group,
      // Only the members this group actually owns: a repeated id belongs to the
      // first group that claimed it, matching what the service stores.
      blocks: group.members
        .filter(m => owner.get(m) === groupId)
        .map(m => byId.get(m))
        .filter((b): b is B => b !== undefined),
    });
    // A group can be anchored to another group - two groups in a row is what
    // the add button produces - so the ones following THIS row come next.
    // `placed` ends any cycle.
    emitAnchored(groupId);
  };
  // Groups anchored to a row, keyed by the row they follow. '' pins to the top.
  const anchored = new Map<string, string[]>();
  for (const group of groups) {
    // == null covers both absent and the JSON null the service sends for a
    // group that has never been placed; only '' means "pin to the top".
    if (group.after == null) continue;
    const list = anchored.get(group.after) ?? [];
    list.push(group.id);
    anchored.set(group.after, list);
  }
  const emitAnchored = (afterId: string) => {
    for (const groupId of anchored.get(afterId) ?? []) emit(groupId);
  };

  emitAnchored('');
  for (const block of blocks) {
    const id = idOf(block);
    const groupId = owner.get(id);
    if (groupId !== undefined) {
      // An anchor is where the user dropped the group, so it outranks the
      // member fallback: emitting at the first member would drag the group
      // back up whenever a member sits earlier in the rail than the anchor.
      const group = groups.find(g => g.id === groupId);
      if (group?.after == null) emit(groupId);
      emitAnchored(id);
      continue;
    }
    rows.push({ kind: 'block', id, block });
    emitAnchored(id);
  }
  // Anything left: a group whose anchor row is gone, or one that never had one.
  for (const group of groups) emit(group.id);
  return rows;
}

/**
 * Rewrites every group's anchor from the rail order it now sits in, so an
 * emptied group stays where the user left it instead of sliding to the tail.
 */
export function anchorGroups(groups: readonly DeviceGroup[], rowIds: readonly string[]): DeviceGroup[] {
  return groups.map(group => {
    const index = rowIds.indexOf(group.id);
    if (index === -1) return group;
    return { ...group, after: index === 0 ? '' : rowIds[index - 1] };
  });
}

/**
 * `base` with the lowest number no other group is wearing, trimmed to fit the
 * name cap. `keepBare` returns `base` itself when it is free, which is what a
 * rename wants; a new group always takes a number, so its rows never read the
 * same in the move-to-group list.
 */
function freeName(
  groups: readonly DeviceGroup[],
  base: string,
  { exceptId, keepBare }: { exceptId?: string; keepBare?: boolean } = {},
): string {
  const taken = new Set(
    groups.filter(g => g.id !== exceptId).map(g => g.name.trim().toLowerCase()),
  );
  const trimmed = base.trim().slice(0, GROUP_NAME_MAX);
  if (keepBare && trimmed.length > 0 && !taken.has(trimmed.toLowerCase())) return trimmed;
  for (let n = 1; ; n++) {
    const suffix = ` ${n}`;
    const name = `${base.trim().slice(0, GROUP_NAME_MAX - suffix.length).trim()}${suffix}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** The name a new group takes: the base word plus the lowest free number. */
export function nextGroupName(groups: readonly DeviceGroup[], base: string): string {
  return freeName(groups, base);
}

/** Adds an empty group, or returns the list unchanged once the cap is reached. */
export function addGroup(groups: readonly DeviceGroup[], name: string): DeviceGroup[] {
  if (groups.length >= MAX_DEVICE_GROUPS) return [...groups];
  return [...groups, { id: newGroupId(), name: nextGroupName(groups, name), members: [] }];
}

/** Drops the group; its members return to the top level, keeping block order. */
export function removeGroup(groups: readonly DeviceGroup[], groupId: string): DeviceGroup[] {
  // Anything anchored to the group inherits its anchor, or the rail would drop
  // those groups at the tail the next time it renders.
  const inherited = groups.find(g => g.id === groupId)?.after;
  return groups
    .filter(g => g.id !== groupId)
    .map(g => (g.after === groupId ? { ...g, after: inherited } : g));
}

export function renameGroup(groups: readonly DeviceGroup[], groupId: string, name: string): DeviceGroup[] {
  // A name another group already wears takes a number instead: the rail and the
  // move-to-group list name groups, so two alike are indistinguishable there.
  return groups.map(g => g.id === groupId
    ? { ...g, name: freeName(groups, name, { exceptId: groupId, keepBare: true }) }
    : g);
}

/**
 * Moves one block into `toGroupId` at `toIndex`, or out to the top level when
 * that is null. The block leaves whatever group held it, so membership stays
 * single-valued without the caller tracking where it came from.
 */
export function moveBlock(
  groups: readonly DeviceGroup[],
  blockId: string,
  toGroupId: string | null,
  toIndex: number,
): DeviceGroup[] {
  const stripped = groups.map(g => ({ ...g, members: g.members.filter(m => m !== blockId) }));
  if (toGroupId === null) return stripped;
  return stripped.map(g => {
    if (g.id !== toGroupId) return g;
    const members = [...g.members];
    members.splice(Math.max(0, Math.min(toIndex, members.length)), 0, blockId);
    return { ...g, members };
  });
}

/** The group holding this block, or null when it sits at the top level. */
export function groupOf(groups: readonly DeviceGroup[], blockId: string): DeviceGroup | null {
  return groups.find(g => g.members.includes(blockId)) ?? null;
}
