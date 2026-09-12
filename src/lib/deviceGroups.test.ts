import { describe, expect, it } from 'vitest';
import {
  addGroup, anchorGroups, applyArrangement, arrangementOf, canGroupIn, containerDepth, groupOf, groupRows, groupedRows,
  groupsIn, hardwareContainerOf, MAX_DEVICE_GROUPS, moveBlock, nextGroupName, removeGroup, renameGroup,
  type DeviceGroup, type GroupedRow,
} from './deviceGroups';

const blocks = ['a', 'b', 'c', 'd'];
const idOf = (b: string) => b;
const group = (id: string, name: string, ...members: string[]): DeviceGroup => ({ id, name, members });
// A group row's blocks, the way the pre-nesting shape listed them.
const blocksOf = (row: GroupedRow<string> | undefined) =>
  row?.kind === 'group' ? row.rows.flatMap(r => r.kind === 'block' ? [r.block] : []) : undefined;

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
    expect(blocksOf(g)).toEqual(['b', 'd']);
  });

  it('orders a group by its stored membership, not by block order', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'Desk', 'd', 'b')]);
    const g = rows.find(r => r.kind === 'group');
    expect(blocksOf(g)).toEqual(['d', 'b']);
  });

  it('skips members whose hardware is absent', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'Desk', 'b', 'gone')]);
    const g = rows.find(r => r.kind === 'group');
    expect(blocksOf(g)).toEqual(['b']);
  });

  it('holds an emptied group at its anchor instead of sliding it to the tail', () => {
    const rows = groupedRows(blocks, idOf, [{ id: 'g1', name: 'Desk', members: [], after: 'a' }]);
    expect(rows.map(r => r.id)).toEqual(['a', 'g1', 'b', 'c', 'd']);
  });

  it('pins a group anchored to the top of the rail', () => {
    const rows = groupedRows(blocks, idOf, [{ id: 'g1', name: 'Desk', members: [], after: '' }]);
    expect(rows.map(r => r.id)).toEqual(['g1', 'a', 'b', 'c', 'd']);
  });

  it('tails a group whose anchor is null, the shape the service sends for one never placed', () => {
    const rows = groupedRows(blocks, idOf, [{ id: 'g1', name: 'Desk', members: [], after: null }]);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'g1']);
  });

  it('tails a group whose anchor row is gone', () => {
    const rows = groupedRows(blocks, idOf, [{ id: 'g1', name: 'Desk', members: [], after: 'unplugged' }]);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'g1']);
  });

  it('honours the anchor even when a member sits earlier in the rail', () => {
    // The group holds 'a' but was dropped after 'c'. Emitting at the first
    // member would drag it back to the top, which is what T1 showed.
    const rows = groupedRows(blocks, idOf, [{ id: 'g1', name: 'Desk', members: ['a'], after: 'c' }]);
    expect(rows.map(r => r.id)).toEqual(['b', 'c', 'g1', 'd']);
  });

  it('keeps an anchored group in place when it holds members too', () => {
    const rows = groupedRows(blocks, idOf, [{ id: 'g1', name: 'Desk', members: ['d'], after: 'a' }]);
    expect(rows.map(r => r.id)).toEqual(['a', 'g1', 'b', 'c']);
  });

  it('still renders a group with nothing plugged in, at the tail', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'Unplugged', 'gone')]);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'g1']);
    const g = rows[4];
    expect(blocksOf(g)).toEqual([]);
  });

  it('renders an empty group so a freshly created one is visible', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'New')]);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'g1']);
  });

  it('never renders a block twice when two groups claim it', () => {
    const rows = groupedRows(blocks, idOf, [group('g1', 'One', 'b'), group('g2', 'Two', 'b', 'c')]);
    const rendered = rows.flatMap(r => r.kind === 'group' ? blocksOf(r) ?? [] : [r.block]);
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

describe('groupedRows anchored to another group', () => {
  const anchored = (id: string, after: string | null, ...members: string[]): DeviceGroup =>
    ({ id, name: id, members, after });

  it('follows the group its anchor names, which is what two groups in a row produce', () => {
    const rows = groupedRows(blocks, idOf, [anchored('g1', 'a', 'c'), anchored('g2', 'g1', 'd')]);
    expect(rows.map(r => r.id)).toEqual(['a', 'g1', 'g2', 'b']);
  });

  it('chains through empty groups', () => {
    const rows = groupedRows(blocks, idOf, [anchored('g1', 'a'), anchored('g2', 'g1'), anchored('g3', 'g2')]);
    expect(rows.map(r => r.id)).toEqual(['a', 'g1', 'g2', 'g3', 'b', 'c', 'd']);
  });

  it('emits a group whose anchor cycles back to it exactly once', () => {
    const rows = groupedRows(blocks, idOf, [anchored('g1', 'g2'), anchored('g2', 'g1')]);
    expect(rows.filter(r => r.id === 'g1')).toHaveLength(1);
    expect(rows.filter(r => r.id === 'g2')).toHaveLength(1);
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

describe('removeGroup anchors', () => {
  it('hands the deleted group\'s anchor to whatever followed it', () => {
    const next = removeGroup(
      [{ id: 'g1', name: 'One', members: [], after: 'a' }, { id: 'g2', name: 'Two', members: [], after: 'g1' }],
      'g1',
    );
    expect(next).toEqual([{ id: 'g2', name: 'Two', members: [], after: 'a' }]);
  });
});

describe('anchorGroups', () => {
  it('records the row each group now follows', () => {
    const groups: DeviceGroup[] = [group('g1', 'One'), group('g2', 'Two')];
    const next = anchorGroups(groups, ['a', 'g1', 'b', 'g2']);
    expect(next[0].after).toBe('a');
    expect(next[1].after).toBe('b');
  });

  it('pins a group that leads the rail with an empty anchor', () => {
    const next = anchorGroups([group('g1', 'One')], ['g1', 'a']);
    expect(next[0].after).toBe('');
  });

  it('leaves a group absent from the rail untouched', () => {
    const groups = [{ id: 'g1', name: 'One', members: [], after: 'a' }];
    expect(anchorGroups(groups, ['b', 'c'])).toEqual(groups);
  });
});

describe('group naming', () => {
  const named = (...names: string[]): DeviceGroup[] =>
    names.map((name, i) => ({ id: `g${i}`, name, members: [] }));

  it('numbers a new group from one, and keeps counting past the ones in use', () => {
    expect(addGroup([], 'Group')[0].name).toBe('Group 1');
    expect(nextGroupName(named('Group 1'), 'Group')).toBe('Group 2');
    expect(nextGroupName(named('Group 1', 'Group 2'), 'Group')).toBe('Group 3');
  });

  it('fills the lowest free number rather than counting the groups', () => {
    expect(nextGroupName(named('Group 1', 'Group 3'), 'Group')).toBe('Group 2');
  });

  it('ignores case and surrounding space when deciding a name is taken', () => {
    expect(nextGroupName(named('  group 1 '), 'Group')).toBe('Group 2');
  });

  it('keeps a typed rename that nothing else wears', () => {
    const groups = named('Group 1', 'Group 2');
    expect(renameGroup(groups, 'g1', 'Desk')[1].name).toBe('Desk');
  });

  it('numbers a rename onto a name another group wears', () => {
    const groups = named('Desk', 'Group 2');
    expect(renameGroup(groups, 'g1', 'Desk')[1].name).toBe('Desk 1');
  });

  it('lets a group keep its own name', () => {
    const groups = named('Desk', 'Shelf');
    expect(renameGroup(groups, 'g0', 'Desk')[0].name).toBe('Desk');
  });

  it('keeps a numbered name inside the length cap', () => {
    const long = 'ABCDEFGHIJKLMNOPQRST';
    expect(long).toHaveLength(20);
    const name = nextGroupName(named(), long);
    expect(name.length).toBeLessThanOrEqual(20);
    expect(name.endsWith(' 1')).toBe(true);
  });
});

// ── Nesting ──────────────────────────────────────────────────────────────────

// A nested group is a row of its parent, placed by its own anchor among the
// parent's members.
const nested = (): DeviceGroup[] => [
  { id: 'p', name: 'Parent', members: ['a', 'd'], after: '' },
  { id: 'n', name: 'Nested', members: ['b'], parent: 'p', after: 'a' },
];
const ids = (rows: readonly GroupedRow<string>[]): unknown[] =>
  rows.map(r => r.kind === 'group' ? [r.id, ids(r.rows)] : r.id);

describe('groupedRows nesting', () => {
  it('renders a nested group among its parent\'s members, at its anchor', () => {
    expect(ids(groupedRows(blocks, idOf, nested()))).toEqual([['p', ['a', ['n', ['b']], 'd']], 'c']);
  });

  it('pins a nested group to the top of its parent with an empty anchor', () => {
    const groups = nested();
    groups[1].after = '';
    expect(ids(groupedRows(blocks, idOf, groups))).toEqual([['p', [['n', ['b']], 'a', 'd']], 'c']);
  });

  it('tails a nested group inside its parent when it was never placed', () => {
    const groups = nested();
    groups[1].after = null;
    expect(ids(groupedRows(blocks, idOf, groups))).toEqual([['p', ['a', 'd', ['n', ['b']]]], 'c']);
  });

  it('surfaces an unanchored parent where the nested group\'s member sits', () => {
    const groups: DeviceGroup[] = [
      { id: 'p', name: 'Parent', members: [] },
      { id: 'n', name: 'Nested', members: ['c'], parent: 'p' },
    ];
    expect(ids(groupedRows(blocks, idOf, groups))).toEqual(['a', 'b', ['p', [['n', ['c']]]], 'd']);
  });

  it('builds a hardware group\'s rows from the groups that name it as parent', () => {
    const groups: DeviceGroup[] = [
      { id: 'root', name: 'Root', members: ['x'] },
      { id: 'inner', name: 'Inner', members: ['b', 'c'], parent: 'mb:1', after: 'a' },
    ];
    expect(ids(groupedRows(blocks, idOf, groups, 'mb:1'))).toEqual(['a', ['inner', ['b', 'c']], 'd']);
    // The root list never shows a group that belongs to a hardware group.
    expect(ids(groupedRows(['x', 'y'], idOf, groups))).toEqual([['root', ['x']], 'y']);
  });
});

describe('arrangementOf', () => {
  it('lists every group\'s rows, nested ones included, and a nested group as a member', () => {
    const arr = arrangementOf(groupedRows(blocks, idOf, nested()));
    expect(arr.rowIds).toEqual(['p', 'c']);
    expect(arr.groupMembers).toEqual({ p: ['a', 'n', 'd'], n: ['b'] });
  });
});

describe('applyArrangement', () => {
  it('writes membership, parents and anchors back from a drop', () => {
    const next = applyArrangement(nested(), { rowIds: ['c', 'p'], groupMembers: { p: ['d', 'n'], n: ['a', 'b'] } }, null);
    expect(next).toEqual([
      { id: 'p', name: 'Parent', members: ['d'], after: 'c', parent: null },
      { id: 'n', name: 'Nested', members: ['a', 'b'], parent: 'p', after: 'd' },
    ]);
  });

  it('lifts a nested group to the top level when it is dropped there', () => {
    const next = applyArrangement(nested(), { rowIds: ['n', 'p', 'c'], groupMembers: { p: ['a', 'd'], n: ['b'] } }, null);
    expect(next.find(g => g.id === 'n')).toEqual({ id: 'n', name: 'Nested', members: ['b'], parent: null, after: '' });
  });

  it('leaves groups of another container alone', () => {
    const groups: DeviceGroup[] = [
      ...nested(),
      { id: 'inner', name: 'Inner', members: ['z'], parent: 'mb:1', after: '' },
    ];
    const next = applyArrangement(groups, { rowIds: ['c', 'p'], groupMembers: { p: ['a', 'd', 'n'], n: ['b'] } }, null);
    expect(next.find(g => g.id === 'inner')).toEqual(groups[2]);
  });

  it('stamps a hardware container onto the groups it holds', () => {
    const groups: DeviceGroup[] = [{ id: 'inner', name: 'Inner', members: [], parent: 'mb:1' }];
    const next = applyArrangement(groups, { rowIds: ['a', 'inner', 'b'], groupMembers: { inner: ['c'] } }, 'mb:1');
    expect(next).toEqual([{ id: 'inner', name: 'Inner', members: ['c'], parent: 'mb:1', after: 'a' }]);
  });
});

describe('containerDepth and canGroupIn', () => {
  it('counts the top level as zero and a top-level or hardware group as one', () => {
    expect(containerDepth(nested(), null)).toBe(0);
    expect(containerDepth(nested(), 'p')).toBe(1);
    expect(containerDepth(nested(), 'mb:1')).toBe(1);
  });

  it('counts a group in a group, a group in a hardware group, and a hardware group in a group as two', () => {
    const groups: DeviceGroup[] = [
      ...nested(),
      { id: 'inner', name: 'Inner', members: [], parent: 'mb:1' },
      { id: 'holder', name: 'Holder', members: ['mb:2'] },
    ];
    expect(containerDepth(groups, 'n')).toBe(2);
    expect(containerDepth(groups, 'inner')).toBe(2);
    expect(containerDepth(groups, 'mb:2')).toBe(2);
  });

  it('allows a new group at depth zero and one, and refuses it at two or past the cap', () => {
    expect(canGroupIn(nested(), null)).toBe(true);
    expect(canGroupIn(nested(), 'p')).toBe(true);
    expect(canGroupIn(nested(), 'n')).toBe(false);
    const full = Array.from({ length: MAX_DEVICE_GROUPS }, (_, i) => group(`g${i}`, `G${i}`));
    expect(canGroupIn(full, null)).toBe(false);
  });
});

describe('groupRows', () => {
  it('wraps the chosen rows in a new group where the first of them sat, in rail order', () => {
    const next = groupRows([], 'Group', null, ['d', 'b'], ['a', 'b', 'c', 'd']);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: 'Group 1', members: ['b', 'd'], parent: null, after: 'a' });
  });

  it('pins the new group to the top when the first row led the container', () => {
    const next = groupRows([], 'Group', null, ['a'], ['a', 'b']);
    expect(next[0].after).toBe('');
  });

  it('takes the rows out of the group they sat in and nests the new one there', () => {
    const groups: DeviceGroup[] = [{ id: 'p', name: 'Parent', members: ['a', 'b', 'c'], after: '' }];
    const next = groupRows(groups, 'Group', 'p', ['b', 'c'], ['a', 'b', 'c']);
    expect(next[0].members).toEqual(['a']);
    expect(next[1]).toMatchObject({ members: ['b', 'c'], parent: 'p', after: 'a' });
  });

  it('re-anchors a sibling that followed a chosen row to the new group', () => {
    const groups: DeviceGroup[] = [{ id: 'g', name: 'G', members: [], after: 'b' }];
    const next = groupRows(groups, 'Group', null, ['b'], ['a', 'b', 'g', 'c']);
    expect(next[0].after).toBe(next[1].id);
  });

  it('refuses a third level and the cap', () => {
    expect(groupRows(nested(), 'Group', 'n', ['b'], ['b'])).toEqual(nested());
  });
});

describe('removeGroup nesting', () => {
  it('returns a nested group\'s members to the parent, in the slot it held', () => {
    const next = removeGroup(nested(), 'n');
    expect(next).toEqual([{ id: 'p', name: 'Parent', members: ['a', 'b', 'd'], after: '' }]);
  });

  it('lifts a nested group up when its parent goes', () => {
    const next = removeGroup(nested(), 'p');
    expect(next).toEqual([{ id: 'n', name: 'Nested', members: ['b'], parent: null, after: 'a' }]);
  });

  it('hands a nested group pinned to the top of its parent the parent\'s slot', () => {
    const groups = nested();
    groups[1].after = '';
    expect(removeGroup(groups, 'p')[0].after).toBe('');
  });
});

describe('moveBlock nesting', () => {
  it('moves a row out of a nested group into the parent\'s list, after the row the group follows', () => {
    const next = moveBlock(nested(), 'b', null, 0);
    expect(next[0].members).toEqual(['a', 'b', 'd']);
    expect(next[1].members).toEqual([]);
  });

  it('moves a row from the parent into a nested group', () => {
    const next = moveBlock(nested(), 'd', 'n', Number.MAX_SAFE_INTEGER);
    expect(next[0].members).toEqual(['a']);
    expect(next[1].members).toEqual(['b', 'd']);
  });
});

describe('groupsIn', () => {
  it('lists the groups sitting directly in a container', () => {
    expect(groupsIn(nested(), null).map(g => g.id)).toEqual(['p']);
    expect(groupsIn(nested(), 'p').map(g => g.id)).toEqual(['n']);
    expect(groupsIn(nested(), 'mb:1')).toEqual([]);
  });
});

describe('hardwareContainerOf', () => {
  it('names the hardware group a nested chain ends in, or null at the top level', () => {
    const groups: DeviceGroup[] = [
      ...nested(),
      { id: 'inner', name: 'Inner', members: [], parent: 'mb:1' },
    ];
    expect(hardwareContainerOf(groups, 'p')).toBeNull();
    expect(hardwareContainerOf(groups, 'n')).toBeNull();
    expect(hardwareContainerOf(groups, 'inner')).toBe('mb:1');
    expect(hardwareContainerOf(groups, 'missing')).toBeNull();
  });
});

describe('cyclic parents', () => {
  const loop: DeviceGroup[] = [
    { id: 'a', name: 'A', members: ['x'], parent: 'b' },
    { id: 'b', name: 'B', members: ['y'], parent: 'a' },
  ];

  it('never recurse forever on hand-edited data', () => {
    expect(containerDepth(loop, 'a')).toBe(2);
    expect(hardwareContainerOf(loop, 'a')).toBeNull();
    expect(groupedRows(['x', 'y', 'z'], idOf, loop).map(r => r.id)).toEqual(['z']);
  });
});
