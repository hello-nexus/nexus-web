import { describe, expect, it } from 'vitest';
import {
  compareItems,
  initRankState,
  renderedItems,
  updateRanking,
  type RankableItem,
  type RankState,
} from './processRanking';

interface Item extends RankableItem {
  values: number[];
}

function item(name: string, current: number, startedAtMs?: number): Item {
  return { name, current, values: [current], startedAtMs };
}

function names<T extends RankableItem>(state: RankState<T>): string[] {
  return [...state.order];
}

const OPTS = { graceRevisions: 3, forceReset: false };
const RESET = { graceRevisions: 3, forceReset: true };

describe('compareItems', () => {
  it('name sort is alphabetical regardless of current/startedAtMs', () => {
    expect(compareItems(item('b', 100), item('a', 1), 'name')).toBeGreaterThan(0);
  });

  it('usage sort ranks by current descending', () => {
    expect(compareItems(item('a', 10), item('b', 90), 'usage')).toBeGreaterThan(0);
  });

  it('recent sort ranks by startedAtMs descending when both report it', () => {
    expect(compareItems(item('a', 0, 1000), item('b', 0, 2000), 'recent')).toBeGreaterThan(0);
  });

  it('recent sort falls back to usage when either side lacks startedAtMs', () => {
    expect(compareItems(item('a', 90), item('b', 1, 500), 'recent')).toBeGreaterThan(0);
    expect(compareItems(item('a', 90), item('b', 1), 'recent')).toBeLessThan(0);
  });
});

describe('updateRanking - order stability', () => {
  it('does not reorder existing rows when only their values change', () => {
    let state = initRankState<Item>();
    state = updateRanking(state, [item('b', 10), item('a', 90), item('c', 3)], 0, 'usage', RESET);
    expect(names(state)).toEqual(['a', 'b', 'c']);

    // Values now favor a totally different usage order, but nothing new
    // entered or left - the display order must stay untouched.
    state = updateRanking(state, [item('b', 99), item('a', 1), item('c', 50)], 1, 'usage', OPTS);
    expect(names(state)).toEqual(['a', 'b', 'c']);
    expect(renderedItems(state).map(i => i.current)).toEqual([1, 99, 50]);
  });

  it('inserts a new item at its sorted position without moving existing rows', () => {
    let state = initRankState<Item>();
    state = updateRanking(state, [item('a', 90), item('c', 10)], 0, 'usage', RESET);
    expect(names(state)).toEqual(['a', 'c']);

    state = updateRanking(state, [item('a', 90), item('c', 10), item('b', 50)], 1, 'usage', OPTS);
    expect(names(state)).toEqual(['a', 'b', 'c']);
  });

  it('sorts multiple simultaneous new items relative to each other', () => {
    let state = initRankState<Item>();
    state = updateRanking(state, [item('a', 90)], 0, 'usage', RESET);
    state = updateRanking(state, [item('a', 90), item('x', 20), item('y', 60), item('z', 5)], 1, 'usage', OPTS);
    expect(names(state)).toEqual(['a', 'y', 'x', 'z']);
  });

  it('a removed item is dropped once its grace window elapses', () => {
    let state = initRankState<Item>();
    state = updateRanking(state, [item('a', 90), item('b', 10)], 0, 'usage', RESET);
    // Missing for 1, 2 revisions - still within grace (3).
    state = updateRanking(state, [item('a', 90)], 1, 'usage', OPTS);
    expect(names(state)).toEqual(['a', 'b']);
    state = updateRanking(state, [item('a', 90)], 2, 'usage', OPTS);
    expect(names(state)).toEqual(['a', 'b']);
    // Missing for 3 revisions - grace expired.
    state = updateRanking(state, [item('a', 90)], 3, 'usage', OPTS);
    expect(names(state)).toEqual(['a']);
  });

  it('retains a briefly-missing item with its frozen last-known values', () => {
    let state = initRankState<Item>();
    state = updateRanking(state, [item('a', 90), item('b', 42)], 0, 'usage', RESET);
    state = updateRanking(state, [item('a', 90)], 1, 'usage', OPTS);
    const rendered = renderedItems(state);
    expect(rendered.find(i => i.name === 'b')?.current).toBe(42);
  });

  it('a re-sighted item within its grace window keeps its original anchor position, not a reinsertion', () => {
    let state = initRankState<Item>();
    state = updateRanking(state, [item('a', 90), item('b', 50), item('c', 10)], 0, 'usage', RESET);
    // b drops out for one revision...
    state = updateRanking(state, [item('a', 90), item('c', 10)], 1, 'usage', OPTS);
    expect(names(state)).toEqual(['a', 'b', 'c']);
    // ...then reappears with a new value - stays in its original slot rather
    // than being sorted as if it were brand new.
    state = updateRanking(state, [item('a', 90), item('b', 1), item('c', 10)], 2, 'usage', OPTS);
    expect(names(state)).toEqual(['a', 'b', 'c']);
  });

  it('forceReset discards grace-held ghosts and re-sorts from scratch', () => {
    let state = initRankState<Item>();
    state = updateRanking(state, [item('a', 90), item('b', 50)], 0, 'usage', RESET);
    state = updateRanking(state, [item('a', 90)], 1, 'usage', OPTS);
    expect(names(state)).toEqual(['a', 'b']);

    // A metric switch (or sort change) resets - b is gone immediately, not
    // held over from the old metric's grace window.
    state = updateRanking(state, [item('x', 5), item('a', 90)], 2, 'usage', RESET);
    expect(names(state)).toEqual(['a', 'x']);
  });

  it('an empty state performs a full initial sort (equivalent to forceReset)', () => {
    const state = updateRanking(initRankState<Item>(), [item('c', 1), item('a', 90), item('b', 40)], 0, 'usage', OPTS);
    expect(names(state)).toEqual(['a', 'b', 'c']);
  });

  it('renderedItems maps the order back onto the tracked items', () => {
    const state = updateRanking(initRankState<Item>(), [item('a', 90), item('b', 40)], 0, 'usage', RESET);
    expect(renderedItems(state).map(i => i.name)).toEqual(['a', 'b']);
  });
});
