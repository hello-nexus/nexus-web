// Arrangement math for GroupedSortableList, kept out of the component so the
// transfer rules are testable without driving a pointer through dnd-kit.

/** Container id for the top-level row list. */
export const ROOT = '__root__';

/** Suffix marking a group's body droppable, so an empty group still takes a drop. */
export const BODY_SUFFIX = '::body';

export interface Arrangement {
  /** Top-level rows in order: group ids and ungrouped block ids. */
  rowIds: string[];
  /** Member block ids per group id. Every group has an entry, empty or not. */
  groupMembers: Record<string, string[]>;
}

export function bodyDroppableId(groupId: string): string {
  return `${groupId}${BODY_SUFFIX}`;
}

/** The container holding `id`, or null when the id is unknown. */
export function containerOf(arr: Arrangement, id: string): string | null {
  if (arr.rowIds.includes(id)) return ROOT;
  for (const [groupId, members] of Object.entries(arr.groupMembers)) {
    if (members.includes(id)) return groupId;
  }
  return null;
}

/**
 * The container a drop over `overId` targets. A group's BODY takes the block
 * inside; the header row does not - it is a top-level row like any other, so a
 * card can be dropped BETWEEN two groups rather than always being sucked into
 * the one under the pointer. A collapsed group has no body on screen, so its
 * header stands in for one.
 */
export function dropContainer(
  arr: Arrangement,
  overId: string,
  collapsedGroupIds: readonly string[] = [],
): string | null {
  if (overId.endsWith(BODY_SUFFIX)) {
    const groupId = overId.slice(0, -BODY_SUFFIX.length);
    return groupId in arr.groupMembers ? groupId : null;
  }
  if (overId in arr.groupMembers) {
    return collapsedGroupIds.includes(overId) ? overId : ROOT;
  }
  return containerOf(arr, overId);
}

function withoutId(arr: Arrangement, id: string): Arrangement {
  const groupMembers: Record<string, string[]> = {};
  for (const [groupId, members] of Object.entries(arr.groupMembers)) {
    groupMembers[groupId] = members.filter(m => m !== id);
  }
  return { rowIds: arr.rowIds.filter(r => r !== id), groupMembers };
}

function insert(list: string[], id: string, index: number): string[] {
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, id);
  return next;
}

/**
 * Places `activeId` into `container` at the slot `overId` occupies. A group id
 * never enters another group: nesting is one level deep, so a group dragged
 * over another group just reorders at the top level.
 */
export function moveTo(
  arr: Arrangement,
  activeId: string,
  overId: string,
  collapsedGroupIds: readonly string[] = [],
): Arrangement {
  const isGroup = activeId in arr.groupMembers;
  let target = dropContainer(arr, overId, collapsedGroupIds);
  if (target === null) return arr;
  if (isGroup && target !== ROOT) target = ROOT;
  if (activeId === overId && containerOf(arr, activeId) === target) return arr;

  const stripped = withoutId(arr, activeId);
  const list = target === ROOT ? stripped.rowIds : stripped.groupMembers[target] ?? [];
  // Dropping on the container itself (header or empty body) appends; dropping
  // on a row takes that row's slot.
  const overIndex = list.indexOf(overId);
  const index = overIndex === -1 ? list.length : overIndex;
  const placed = insert(list, activeId, index);

  return target === ROOT
    ? { rowIds: placed, groupMembers: stripped.groupMembers }
    : { rowIds: stripped.rowIds, groupMembers: { ...stripped.groupMembers, [target]: placed } };
}
