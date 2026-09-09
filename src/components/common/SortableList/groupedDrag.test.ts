import { describe, expect, it } from 'vitest';
import { bodyDroppableId, containerOf, dropContainer, moveTo, ROOT, type Arrangement } from './groupedDrag';

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
  it('targets the group when the drop is on its header', () => {
    expect(dropContainer(arr(), 'g1')).toBe('g1');
  });

  it('targets the group when the drop is on its body, so an empty one takes a card', () => {
    expect(dropContainer(arr(), bodyDroppableId('g2'))).toBe('g2');
  });

  it('targets a block\'s own container', () => {
    expect(dropContainer(arr(), 'c')).toBe('g1');
    expect(dropContainer(arr(), 'b')).toBe(ROOT);
  });
});

describe('moveTo', () => {
  it('pulls a top-level block into a group at the slot it was dropped on', () => {
    const next = moveTo(arr(), 'a', 'd');
    expect(next.rowIds).toEqual(['g1', 'b']);
    expect(next.groupMembers.g1).toEqual(['c', 'a', 'd']);
  });

  it('appends when the drop lands on the group header', () => {
    const next = moveTo(arr(), 'a', 'g1');
    expect(next.groupMembers.g1).toEqual(['c', 'd', 'a']);
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

  it('never nests a group inside another group', () => {
    const next = moveTo(arr(), 'g2', 'd');
    expect(next.groupMembers.g1).toEqual(['c', 'd']);
    expect(next.rowIds).toContain('g2');
  });

  it('leaves the arrangement alone for an unknown drop target', () => {
    const before = arr();
    expect(moveTo(before, 'a', 'nope')).toEqual(before);
  });
});
