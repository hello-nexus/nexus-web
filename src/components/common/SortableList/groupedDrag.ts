// Arrangement math for GroupedSortableList, kept out of the component so the
// transfer rules are testable without driving a pointer through dnd-kit.

/** Container id for the top-level row list. */
export const ROOT = '__root__';

/** Suffix marking a group's body droppable, so an empty group still takes a drop. */
export const BODY_SUFFIX = '::body';

/**
 * Droppable sitting under the last row while a drag is in flight. Without it a
 * rail whose last row is a group has no reachable spot for "outside the group,
 * at the bottom" - every pixel down there is inside the group.
 */
export const TAIL = '__tail__';

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
 * The container a drop over `overId` targets. A group takes the block inside
 * whether the pointer is on its header or its body: an empty group has no body
 * worth aiming at, and reserving one shifted the whole rail the moment a drag
 * started. To leave a group, drop the card on a row outside it.
 */
export function dropContainer(arr: Arrangement, overId: string): string | null {
  if (overId === TAIL) return ROOT;
  if (overId.endsWith(BODY_SUFFIX)) {
    const groupId = overId.slice(0, -BODY_SUFFIX.length);
    return groupId in arr.groupMembers ? groupId : null;
  }
  if (overId in arr.groupMembers) return overId;
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
export function moveTo(arr: Arrangement, activeId: string, overId: string): Arrangement {
  const isGroup = activeId in arr.groupMembers;
  let target = dropContainer(arr, overId);
  if (target === null) return arr;
  if (isGroup && target !== ROOT) target = ROOT;
  if (activeId === overId && containerOf(arr, activeId) === target) return arr;

  const before = target === ROOT ? arr.rowIds : arr.groupMembers[target] ?? [];
  const fromIndex = before.indexOf(activeId);
  const overIndexBefore = before.indexOf(overId);

  const stripped = withoutId(arr, activeId);
  const list = target === ROOT ? stripped.rowIds : stripped.groupMembers[target] ?? [];
  // Dropping on the container itself (header or empty body) appends; dropping
  // on a row takes that row's slot. Moving DOWN within one container, removing
  // the row first shifts the target up by one, so taking its slot would land
  // the card back where it started - it has to go after the target instead.
  const overIndex = list.indexOf(overId);
  const movingDown = fromIndex !== -1 && overIndexBefore !== -1 && fromIndex < overIndexBefore;
  const index = overIndex === -1 ? list.length : overIndex + (movingDown ? 1 : 0);
  const placed = insert(list, activeId, index);

  return target === ROOT
    ? { rowIds: placed, groupMembers: stripped.groupMembers }
    : { rowIds: stripped.rowIds, groupMembers: { ...stripped.groupMembers, [target]: placed } };
}

/** True when two arrangements hold the same rows in the same order. */
export function sameArrangement(a: Arrangement, b: Arrangement): boolean {
  if (a === b) return true;
  if (a.rowIds.length !== b.rowIds.length) return false;
  for (let i = 0; i < a.rowIds.length; i++) {
    if (a.rowIds[i] !== b.rowIds[i]) return false;
  }
  const aKeys = Object.keys(a.groupMembers);
  const bKeys = Object.keys(b.groupMembers);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const left = a.groupMembers[key];
    const right = b.groupMembers[key];
    if (right === undefined || left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false;
    }
  }
  return true;
}
