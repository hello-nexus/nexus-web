import { describe, expect, it } from 'vitest';
import {
  addGroup, groupOf, groupedRows, MAX_DEVICE_GROUPS, moveBlock, removeGroup, renameGroup,
  type DeviceGroup,
} from './deviceGroups';

const blocks = ['a', 'b', 'c', 'd'];
const idOf = (b: string) => b;
const group = (id: string, name: string, ...members: string[]): DeviceGroup => ({ id, name, members });

describe('groupedRows', () => {
  it('leaves every block at the top level with no groups', () => {
    const rows = groupedRows(blocks, idOf, []);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.every(r => r.kind === 'block')).toBe(true);
  });

  it('places a group where its first present member sat', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'Desk', 'b', 'd')]);
    expect(rows.map(r => r.id)).toEqual(['a', 'g1', 'c']);
    const g = rows[1];
    expect(g.kind === 'group' && g.blocks).toEqual(['b', 'd']);
  });

  it('orders a group by its stored membership, not by block order', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'Desk', 'd', 'b')]);
    const g = rows.find(r => r.kind === 'group');
    expect(g && g.kind === 'group' && g.blocks).toEqual(['d', 'b']);
  });

  it('skips members whose hardware is absent', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'Desk', 'b', 'gone')]);
    const g = rows.find(r => r.kind === 'group');
    expect(g && g.kind === 'group' && g.blocks).toEqual(['b']);
  });

  it('still renders a group with nothing plugged in, at the tail', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'Unplugged', 'gone')]);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'g1']);
    const g = rows[4];
    expect(g.kind === 'group' && g.blocks).toEqual([]);
  });

  it('renders an empty group so a freshly created one is visible', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'New')]);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'g1']);
  });

  it('never renders a block twice when two groups claim it', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'One', 'b'), group('g2', 'Two', 'b', 'c')]);
    const rendered = rows.flatMap(r => r.kind === 'group' ? r.blocks : [r.block]);
    expect(rendered).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('group mutations', () => {
  it('adds a group up to the cap and then stops', () => {
    let groups: DeviceGroup[] = [];
    for (let i = 0; i < MAX_DEVICE_GROUPS + 3; i++) groups = addGroup(groups, `G${i}`);
    expect(groups).toHaveLength(MAX_DEVICE_GROUPS);
  });

  it('creates a group empty', () => {
    expect(addGroup([], 'Desk')[0].members).toEqual([]);
  });

  it('returns members to the top level when the group goes', () => {
    const groups = removeGroup([group('g1', 'Desk', 'b')], 'g1');
    expect(groupedRows(blocks, idOf, groups).map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('renames in place and caps the name', () => {
    const groups = renameGroup([group('g1', 'Desk', 'b')], 'g1', 'x'.repeat(40));
    expect(groups[0].name).toHaveLength(20);
    expect(groups[0].members).toEqual(['b']);
  });
});

describe('moveBlock', () => {
  const two = [group('g1', 'One', 'a', 'b'), group('g2', 'Two', 'c')];

  it('moves a block between groups, leaving the old one', () => {
    const next = moveBlock(two, 'a', 'g2', 0);
    expect(next[0].members).toEqual(['b']);
    expect(next[1].members).toEqual(['a', 'c']);
  });

  it('moves a block out to the top level', () => {
    const next = moveBlock(two, 'a', null, 0);
    expect(next[0].members).toEqual(['b']);
    expect(groupOf(next, 'a')).toBeNull();
  });

  it('reorders inside one group', () => {
    const next = moveBlock(two, 'a', 'g1', 1);
    expect(next[0].members).toEqual(['b', 'a']);
  });

  it('clamps an index past the end', () => {
    const next = moveBlock(two, 'c', 'g1', 99);
    expect(next[0].members).toEqual(['a', 'b', 'c']);
  });
});
