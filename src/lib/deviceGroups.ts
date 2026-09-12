// User-made groups on the lighting and cooling rails. Both pages already build
// their own intrinsic blocks (a card, or a hardware group like a motherboard's
// headers); these helpers layer the user's grouping over whatever those are, so
// the two pages share one model, one cap and one set of drag rules. A group
// sits in a container - the top level, another group, or a hardware group -
// and nesting stops two groups deep, hardware groups counted.

import type { Arrangement } from '../components/common/SortableList/groupedDrag';

/** Mirrors DeviceGroupList.MaxGroups in nexus-service; the service caps too. */
export const MAX_DEVICE_GROUPS = 10;

/** Name cap, matching the rename field on cards and group headers. */
export const GROUP_NAME_MAX = 20;

/** Groups enclosing a row, at most; a hardware group counts as one. */
export const MAX_GROUP_DEPTH = 2;

export interface DeviceGroup {
  id: string;
  name: string;
  /** Ids of the blocks in this group, in display order. Never a group id: a
   *  nested group names this one as its `parent` instead. */
  members: string[];
  /** Id of the rail row this group sits after; '' pins it to the top and
   *  null/absent means never placed, which tails it. Anchoring to the first
   *  member cannot hold an emptied group in place, so the rail order the user
   *  last dropped is stored instead. */
  after?: string | null;
  /** The container this group sits in: null/absent for the top level, another
   *  group's id, or a hardware group's block key. */
  parent?: string | null;
}

/** One rail row: an ungrouped block, or a user group holding rows of its own. */
export type GroupedRow<B> =
  | { kind: 'block'; id: string; block: B }
  | { kind: 'group'; id: string; group: DeviceGroup; rows: GroupedRow<B>[] };

export function newGroupId(): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return `grp-${rand}`;
}

const parentOf = (g: DeviceGroup): string | null => g.parent ?? null;

/**
 * The rows of one container. A group sits after the row its anchor names, or,
 * with no anchor, where its first present member sits in block order, so a
 * group and an ungrouped block interleave the way two blocks do. A group whose
 * members are all absent (hardware unplugged) still renders, empty, so the user
 * can see it and drop into it. A group's own rows are built the same way, so a
 * group nested in it lands among its members.
 *
 * `container` is the level being built: null for the rail's top level, or a
 * hardware group's block key when `blocks` are that group's zones.
 */
export function groupedRows<B>(
  blocks: readonly B[],
  idOf: (block: B) => string,
  groups: readonly DeviceGroup[],
  container: string | null = null,
): GroupedRow<B>[] {
  const byId = new Map(blocks.map(b => [idOf(b), b]));
  const byGroupId = new Map(groups.map(g => [g.id, g]));
  const owner = new Map<string, string>();
  for (const group of groups) {
    for (const member of group.members) {
      if (!owner.has(member)) owner.set(member, group.id);
    }
  }
  // The ancestor of `groupId` sitting directly in `at`, or null when the chain never reaches it.
  const surfaceIn = (groupId: string, at: string | null): DeviceGroup | null => {
    const seen = new Set<string>();
    let g = byGroupId.get(groupId);
    while (g && parentOf(g) !== at && !seen.has(g.id)) {
      seen.add(g.id);
      g = byGroupId.get(parentOf(g) ?? '');
    }
    return g && parentOf(g) === at ? g : null;
  };

  // Shared across levels so a group renders once, where it is first reached.
  const placed = new Set<string>();
  const build = (at: string | null, pool: readonly string[]): GroupedRow<B>[] => {
    const own = groups.filter(g => parentOf(g) === at);
    const rows: GroupedRow<B>[] = [];
    // Groups anchored to a row, keyed by the row they follow. '' pins to the top.
    const anchored = new Map<string, string[]>();
    for (const group of own) {
      // == null covers both absent and the JSON null the service sends for a
      // group that has never been placed; only '' means "pin to the top".
      if (group.after == null) continue;
      const list = anchored.get(group.after) ?? [];
      list.push(group.id);
      anchored.set(group.after, list);
    }
    const emit = (groupId: string) => {
      const group = byGroupId.get(groupId);
      if (!group || placed.has(groupId)) return;
      placed.add(groupId);
      rows.push({
        kind: 'group',
        id: groupId,
        group,
        // Only the members this group actually owns: a repeated id belongs to the
        // first group that claimed it, matching what the service stores.
        rows: build(groupId, group.members.filter(m => owner.get(m) === groupId && byId.has(m))),
      });
      // A group can be anchored to another group - two groups in a row is what
      // the add button produces - so the ones following THIS row come next.
      // `placed` ends any cycle.
      emitAnchored(groupId);
    };
    const emitAnchored = (afterId: string) => {
      for (const groupId of anchored.get(afterId) ?? []) emit(groupId);
    };

    emitAnchored('');
    for (const id of pool) {
      const ownerId = owner.get(id);
      // An owner whose chain never surfaces here (its container is gone, or
      // the row moved levels) leaves the row rendered plain, never dropped.
      const group = ownerId !== undefined && ownerId !== at ? surfaceIn(ownerId, at) : null;
      if (group) {
        // An anchor is where the user dropped the group, so it outranks the
        // member fallback: emitting at the first member would drag the group
        // back up whenever a member sits earlier in the rail than the anchor.
        if (group.after == null) emit(group.id);
        emitAnchored(id);
        continue;
      }
      const block = byId.get(id);
      if (block !== undefined) rows.push({ kind: 'block', id, block });
      emitAnchored(id);
    }
    // Anything left: a group whose anchor row is gone, or one that never had one.
    for (const group of own) emit(group.id);
    return rows;
  };
  return build(container, blocks.map(idOf));
}

/** The drag list's view of a row tree: sibling ids per container, a nested group listed among its parent's members. */
export function arrangementOf<B>(rows: readonly GroupedRow<B>[]): Arrangement {
  const groupMembers: Record<string, string[]> = {};
  const visit = (list: readonly GroupedRow<B>[]) => {
    for (const row of list) {
      if (row.kind !== 'group') continue;
      groupMembers[row.id] = row.rows.map(r => r.id);
      visit(row.rows);
    }
  };
  visit(rows);
  return { rowIds: rows.map(r => r.id), groupMembers };
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
 * Writes a drop back into the groups: membership, parent and anchor for every
 * group the arrangement lists, at any depth; groups of other containers are
 * left alone. `container` is the level the arrangement's top rows sit in.
 */
export function applyArrangement(
  groups: readonly DeviceGroup[],
  next: Arrangement,
  container: string | null,
): DeviceGroup[] {
  const isGroup = (id: string) => id in next.groupMembers;
  let out = [...groups];
  const place = (siblings: readonly string[], parent: string | null) => {
    for (const id of siblings) {
      if (!isGroup(id)) continue;
      const rows = next.groupMembers[id] ?? [];
      out = out.map(g => g.id === id ? { ...g, parent, members: rows.filter(m => !isGroup(m)) } : g);
      place(rows, id);
    }
    out = anchorGroups(out, siblings);
  };
  place(next.rowIds, container);
  return out;
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

/** Adds an empty top-level group, or returns the list unchanged once the cap is reached. */
export function addGroup(groups: readonly DeviceGroup[], name: string): DeviceGroup[] {
  if (groups.length >= MAX_DEVICE_GROUPS) return [...groups];
  return [...groups, { id: newGroupId(), name: nextGroupName(groups, name), members: [] }];
}

/** Groups enclosing the rows of `container`: 0 at the top level; a hardware group (any id naming no user group) counts as one. */
export function containerDepth(groups: readonly DeviceGroup[], container: string | null, seen = new Set<string>()): number {
  // `seen` ends a cycle in hand-edited data; the depth past it is moot.
  if (container === null || seen.has(container)) return 0;
  seen.add(container);
  const group = groups.find(g => g.id === container);
  if (group) return 1 + containerDepth(groups, parentOf(group), seen);
  const holder = groupOf(groups, container);
  return holder ? 1 + containerDepth(groups, holder.id, seen) : 1;
}

/** True when a new group fits inside `container`: under the cap, and a level left under the nesting limit. */
export function canGroupIn(groups: readonly DeviceGroup[], container: string | null): boolean {
  return groups.length < MAX_DEVICE_GROUPS && containerDepth(groups, container) < MAX_GROUP_DEPTH;
}

/**
 * Wraps `rowIds`, siblings inside `container`, in a new group placed where the
 * first of them sat; `siblings` is the container's row order. Unchanged when
 * {@link canGroupIn} says no.
 */
export function groupRows(
  groups: readonly DeviceGroup[],
  name: string,
  container: string | null,
  rowIds: readonly string[],
  siblings: readonly string[],
): DeviceGroup[] {
  const chosen = new Set(rowIds);
  const ordered = siblings.filter(id => chosen.has(id));
  if (ordered.length === 0 || !canGroupIn(groups, container)) return [...groups];
  const first = siblings.indexOf(ordered[0]);
  const id = newGroupId();
  const stripped = groups.map(g => {
    let next = g;
    if (g.id === container) next = { ...next, members: next.members.filter(m => !chosen.has(m)) };
    // A sibling anchored to a row that just moved inside follows the new group, so it keeps its spot.
    if (next.after != null && chosen.has(next.after)) next = { ...next, after: id };
    return next;
  });
  return [...stripped, {
    id,
    name: nextGroupName(groups, name),
    members: ordered,
    parent: container,
    after: first <= 0 ? '' : siblings[first - 1],
  }];
}

/** Drops the group: its members return to the container it sat in and any group nested in it moves up one level. */
export function removeGroup(groups: readonly DeviceGroup[], groupId: string): DeviceGroup[] {
  const gone = groups.find(g => g.id === groupId);
  if (!gone) return [...groups];
  const parent = parentOf(gone);
  return groups
    .filter(g => g.id !== groupId)
    .map(g => {
      let next = g;
      // Anything anchored to the group inherits its anchor, or the rail would
      // drop those groups at the tail the next time it renders.
      if (next.after === groupId) next = { ...next, after: gone.after };
      // A nested group pinned to the deleted group's top takes its slot; any
      // other anchor names a member returning to the same container, so it holds.
      if (parentOf(next) === groupId) {
        next = { ...next, parent, after: next.after === '' ? gone.after : next.after };
      }
      if (next.id === parent) {
        const members = [...next.members];
        members.splice(slotAfter(members, gone.after), 0, ...gone.members);
        next = { ...next, members };
      }
      return next;
    });
}

export function renameGroup(groups: readonly DeviceGroup[], groupId: string, name: string): DeviceGroup[] {
  // A name another group already wears takes a number instead: the rail and the
  // move-to-group list name groups, so two alike are indistinguishable there.
  return groups.map(g => g.id === groupId
    ? { ...g, name: freeName(groups, name, { exceptId: groupId, keepBare: true }) }
    : g);
}

/**
 * Moves one block into `toGroupId` at `toIndex`, or, when that is null, out to
 * the container of the group holding it. The block leaves whatever group held
 * it, so membership stays single-valued without the caller tracking where it
 * came from.
 */
export function moveBlock(
  groups: readonly DeviceGroup[],
  blockId: string,
  toGroupId: string | null,
  toIndex: number,
): DeviceGroup[] {
  const from = groupOf(groups, blockId);
  const stripped = groups.map(g => ({ ...g, members: g.members.filter(m => m !== blockId) }));
  // Only a parent GROUP has a list to join; unclaimed is the top level or the hardware group.
  const target = toGroupId ?? (from ? parentOf(from) : null);
  if (target === null) return stripped;
  return stripped.map(g => {
    if (g.id !== target) return g;
    const members = [...g.members];
    const index = toGroupId === null ? slotAfter(members, from?.after) : toIndex;
    members.splice(Math.max(0, Math.min(index, members.length)), 0, blockId);
    return { ...g, members };
  });
}

// The slot after `after` among `members`: the top for '', the end when the anchor is absent or names no member.
function slotAfter(members: readonly string[], after: string | null | undefined): number {
  if (after === '') return 0;
  const index = after ? members.indexOf(after) : -1;
  return index === -1 ? members.length : index + 1;
}

/** The group holding this block, or null when it sits at the top level. */
export function groupOf(groups: readonly DeviceGroup[], blockId: string): DeviceGroup | null {
  return groups.find(g => g.members.includes(blockId)) ?? null;
}

/** The groups sitting directly in `container`. */
export function groupsIn(groups: readonly DeviceGroup[], container: string | null): DeviceGroup[] {
  return groups.filter(g => parentOf(g) === container);
}

/** The hardware group a user group ultimately sits in, or null at the rail's top level. */
export function hardwareContainerOf(groups: readonly DeviceGroup[], groupId: string, seen = new Set<string>()): string | null {
  const group = groups.find(g => g.id === groupId);
  const parent = group ? parentOf(group) : null;
  if (parent === null || seen.has(groupId)) return null;
  seen.add(groupId);
  return groups.some(g => g.id === parent) ? hardwareContainerOf(groups, parent, seen) : parent;
}
