import { describe, expect, it } from 'vitest';
import { bodyDroppableId, containerOf, dropContainer, moveTo, resolveDrop, ROOT, sameArrangement, TAIL, type Arrangement } from './groupedDrag';

const arr = (): Arrangement => ({
  rowIds: ['a', 'g1', 'b'],
  groupMembers: { g1: ['c', 'd'], g2: [] },
});

describe('containerOf', () => {
  it('reports the top level for an ungrouped block', () => {
    expect(containerOf(arr(), 'a')).toBe(ROOT);
  });

  it('reports the top level for a group row itself', () => {
    expect(containerOf(arr(), 'g1')).toBe(ROOT);
  });

  it('reports the owning group for a member', () => {
    expect(containerOf(arr(), 'd')).toBe('g1');
  });

  it('reports nothing for an unknown id', () => {
    expect(containerOf(arr(), 'nope')).toBeNull();
  });
});

describe('dropContainer', () => {
  it('takes the group when the pointer is on its header, collapsed or not', () => {
    expect(dropContainer(arr(), 'g1')).toBe('g1');
  });

  it('targets the group when the drop is on its body, so an empty one takes a card', () => {
    expect(dropContainer(arr(), bodyDroppableId('g2'))).toBe('g2');
  });

  it('targets a block\'s own container', () => {
    expect(dropContainer(arr(), 'c')).toBe('g1');
    expect(dropContainer(arr(), 'b')).toBe(ROOT);
  });

  it('sends the strip under the last row to the top level', () => {
    expect(dropContainer(arr(), TAIL)).toBe(ROOT);
  });
});

describe('moveTo', () => {
  it('pulls a top-level block into a group at the slot it was dropped on', () => {
    const next = moveTo(arr(), 'a', 'd');
    expect(next.rowIds).toEqual(['g1', 'b']);
    expect(next.groupMembers.g1).toEqual(['c', 'a', 'd']);
  });

  it('drops into a group through its header', () => {
    const next = moveTo(arr(), 'a', 'g1');
    expect(next.groupMembers.g1).toEqual(['c', 'd', 'a']);
    expect(next.rowIds).toEqual(['g1', 'b']);
  });

  it('fills an empty group from its body droppable', () => {
    const next = moveTo(arr(), 'a', bodyDroppableId('g2'));
    expect(next.groupMembers.g2).toEqual(['a']);
    expect(next.rowIds).toEqual(['g1', 'b']);
  });

  it('lifts a member back out to the top level', () => {
    const next = moveTo(arr(), 'c', 'b');
    expect(next.groupMembers.g1).toEqual(['d']);
    expect(next.rowIds).toEqual(['a', 'g1', 'c', 'b']);
  });

  it('moves a member straight between groups', () => {
    const next = moveTo(arr(), 'c', bodyDroppableId('g2'));
    expect(next.groupMembers.g1).toEqual(['d']);
    expect(next.groupMembers.g2).toEqual(['c']);
  });

  it('reorders inside one group', () => {
    const next = moveTo(arr(), 'd', 'c');
    expect(next.groupMembers.g1).toEqual(['d', 'c']);
  });

  it('reorders groups at the top level', () => {
    const next = moveTo(arr(), 'g1', 'a');
    expect(next.rowIds).toEqual(['g1', 'a', 'b']);
  });

  it('never nests a group inside another group with nesting off', () => {
    const next = moveTo(arr(), 'g2', 'd');
    expect(next.groupMembers.g1).toEqual(['c', 'd']);
    expect(next.rowIds).toContain('g2');
  });

  it('leaves the arrangement alone for an unknown drop target', () => {
    const before = arr();
    expect(moveTo(before, 'a', 'nope')).toEqual(before);
  });
});

// The drop handler skips onArrange when nothing moved. Without that, a drag
// that ends where it started re-renders the rail for no reason, and the same
// equality is what kept the old mid-drag transfer from looping forever.
describe('moveTo onto the tail', () => {
  it('takes a group member out and puts it last, so a trailing group cannot swallow the bottom', () => {
    const next = moveTo(arr(), 'c', TAIL);
    expect(next.rowIds).toEqual(['a', 'g1', 'b', 'c']);
    expect(next.groupMembers.g1).toEqual(['d']);
  });

  it('sends a top-level block to the end', () => {
    const next = moveTo(arr(), 'a', TAIL);
    expect(next.rowIds).toEqual(['g1', 'b', 'a']);
  });
});

describe('moveTo onto a group the row is already in', () => {
  it('leaves a member alone when it is dropped on its own group header', () => {
    expect(moveTo(arr(), 'c', 'g1')).toEqual(arr());
  });

  it('leaves a member alone when it is dropped on its own group body', () => {
    expect(moveTo(arr(), 'c', bodyDroppableId('g1'))).toEqual(arr());
  });

  it('still reorders a GROUP dragged over another group, which is a sibling not a container', () => {
    const twoGroups: Arrangement = { rowIds: ['g1', 'a', 'g2'], groupMembers: { g1: [], g2: [] } };
    expect(moveTo(twoGroups, 'g1', 'g2').rowIds).toEqual(['a', 'g2', 'g1']);
  });
});

describe('moveTo with a GROUP over a card inside another group', () => {
  it('takes the slot of the group that owns the card, not the end of the rail', () => {
    const two: Arrangement = { rowIds: ['g1', 'g2', 'z'], groupMembers: { g1: ['x'], g2: ['y'] } };
    expect(moveTo(two, 'g1', 'y').rowIds).toEqual(['g2', 'g1', 'z']);
  });

  it('takes that slot when dragged upward too', () => {
    const two: Arrangement = { rowIds: ['g1', 'g2'], groupMembers: { g1: ['x'], g2: ['y'] } };
    expect(moveTo(two, 'g2', 'x').rowIds).toEqual(['g2', 'g1']);
  });
});

describe('sameArrangement', () => {
  it('accepts an identical arrangement built separately', () => {
    expect(sameArrangement(arr(), arr())).toBe(true);
  });

  it('sees a reordered top level', () => {
    expect(sameArrangement(arr(), { ...arr(), rowIds: ['g1', 'a', 'b'] })).toBe(false);
  });

  it('sees a changed membership', () => {
    expect(sameArrangement(arr(), { ...arr(), groupMembers: { g1: ['d', 'c'], g2: [] } })).toBe(false);
  });

  it('sees a member added to a group', () => {
    expect(sameArrangement(arr(), { ...arr(), groupMembers: { g1: ['c', 'd'], g2: ['e'] } })).toBe(false);
  });

  it('sees a group appearing', () => {
    expect(sameArrangement(arr(), { ...arr(), groupMembers: { g1: ['c', 'd'] } })).toBe(false);
  });

  it('reports a no-op move as unchanged, which is what stops the drop churn', () => {
    const before = arr();
    expect(sameArrangement(before, moveTo(before, 'c', 'c'))).toBe(true);
  });
});

// Removing the dragged row first shifts anything below it up by one, so a
// downward move that simply takes the target's slot lands back where it began.
describe('moveTo direction', () => {
  const flat = (): Arrangement => ({ rowIds: ['a', 'b', 'c', 'd'], groupMembers: {} });

  it('moves a row DOWN past the one it was dropped on', () => {
    expect(moveTo(flat(), 'a', 'b').rowIds).toEqual(['b', 'a', 'c', 'd']);
  });

  it('moves a row down across several positions', () => {
    expect(moveTo(flat(), 'a', 'c').rowIds).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a row UP into the slot it was dropped on', () => {
    expect(moveTo(flat(), 'd', 'b').rowIds).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves a row up to the very top', () => {
    expect(moveTo(flat(), 'c', 'a').rowIds).toEqual(['c', 'a', 'b', 'd']);
  });

  it('reorders downward inside a group too', () => {
    const arrangement: Arrangement = { rowIds: ['g1'], groupMembers: { g1: ['x', 'y', 'z'] } };
    expect(moveTo(arrangement, 'x', 'y').groupMembers.g1).toEqual(['y', 'x', 'z']);
  });

  it('reorders upward inside a group', () => {
    const arrangement: Arrangement = { rowIds: ['g1'], groupMembers: { g1: ['x', 'y', 'z'] } };
    expect(moveTo(arrangement, 'z', 'y').groupMembers.g1).toEqual(['x', 'z', 'y']);
  });
});

// With nesting on, a group may enter a top-level group and no further: the
// tree stays two deep whichever way it is built.
describe('moveTo with nesting on', () => {
  const nest = { nestGroups: true };
  // g1 holds a card and the nested group n; g2 is a top-level sibling.
  const tree = (): Arrangement => ({
    rowIds: ['a', 'g1', 'g2'],
    groupMembers: { g1: ['c', 'n'], n: ['d'], g2: ['e'] },
  });

  it('drops a group into a top-level group at the slot of the card under the pointer', () => {
    const next = moveTo(tree(), 'g2', 'c', nest);
    expect(next.rowIds).toEqual(['a', 'g1']);
    expect(next.groupMembers.g1).toEqual(['g2', 'c', 'n']);
    expect(next.groupMembers.g2).toEqual(['e']);
  });

  it('drops a group into a top-level group through its header', () => {
    const next = moveTo(tree(), 'g2', 'g1', nest);
    expect(next.groupMembers.g1).toEqual(['c', 'n', 'g2']);
  });

  it('keeps a group that already holds a group at the top level, beside the group under the pointer', () => {
    const next = moveTo(tree(), 'g1', 'e', nest);
    expect(next.rowIds).toEqual(['a', 'g2', 'g1']);
    expect(next.groupMembers.g2).toEqual(['e']);
  });

  it('settles a group beside a nested group instead of entering it', () => {
    const next = moveTo(tree(), 'g2', 'd', nest);
    expect(next.groupMembers.g1).toEqual(['c', 'g2', 'n']);
    expect(next.groupMembers.n).toEqual(['d']);
  });

  it('lifts a nested group out to the top level', () => {
    const next = moveTo(tree(), 'n', 'a', nest);
    expect(next.rowIds).toEqual(['n', 'a', 'g1', 'g2']);
    expect(next.groupMembers.g1).toEqual(['c']);
    expect(next.groupMembers.n).toEqual(['d']);
  });

  it('never drops a group into itself or its own child', () => {
    expect(moveTo(tree(), 'g1', 'd', nest)).toEqual(tree());
    expect(moveTo(tree(), 'g1', bodyDroppableId('n'), nest)).toEqual(tree());
  });

  it('lets a group block into a top-level group but not a nested one', () => {
    const rules = { nestGroups: true, groupBlock: (id: string) => id === 'a' };
    expect(moveTo(tree(), 'a', 'c', rules).groupMembers.g1).toEqual(['a', 'c', 'n']);
    const next = moveTo(tree(), 'a', 'd', rules);
    expect(next.groupMembers.g1).toEqual(['c', 'a', 'n']);
    expect(next.groupMembers.n).toEqual(['d']);
  });

  it('keeps a group block that holds a group at the top level', () => {
    const rules = { nestGroups: true, groupBlock: (id: string) => id === 'a', holdsGroup: (id: string) => id === 'a' };
    const next = moveTo(tree(), 'a', 'c', rules);
    expect(next.rowIds).toEqual(['g1', 'a', 'g2']);
    expect(next.groupMembers.g1).toEqual(['c', 'n']);
  });

  it('keeps a group holding a group block at the top level', () => {
    const holder: Arrangement = { rowIds: ['h', 'g1'], groupMembers: { h: ['mb'], g1: ['c'] } };
    const rules = { nestGroups: true, groupBlock: (id: string) => id === 'mb' };
    expect(moveTo(holder, 'h', 'c', rules).rowIds).toEqual(['g1', 'h']);
  });

  it('still lets a plain card into a nested group', () => {
    const next = moveTo(tree(), 'a', 'd', nest);
    expect(next.groupMembers.n).toEqual(['a', 'd']);
  });
});

describe('resolveDrop', () => {
  it('reports the container a card would enter', () => {
    expect(resolveDrop(arr(), 'a', 'd')).toEqual({ overId: 'd', target: 'g1' });
  });

  it('climbs to the group\'s own slot when the depth rule forbids the container', () => {
    expect(resolveDrop(arr(), 'g2', 'd')).toEqual({ overId: 'g1', target: ROOT });
  });

  it('is null for an unknown target', () => {
    expect(resolveDrop(arr(), 'a', 'nope')).toBeNull();
  });
});
