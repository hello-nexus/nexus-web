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

  it('recent sort breaks a tied startedAtMs by name, never leaving it undefined-ordered', () => {
    expect(compareItems(item('b', 0, 1000), item('a', 0, 1000), 'recent')).toBeGreaterThan(0);
    expect(compareItems(item('a', 0, 1000), item('b', 0, 1000), 'recent')).toBeLessThan(0);
  });

  it('usage sort breaks a tied current value by name (round 5: idle rows must not swap tick to tick)', () => {
    expect(compareItems(item('b', 0), item('a', 0), 'usage')).toBeGreaterThan(0);
    expect(compareItems(item('a', 0), item('b', 0), 'usage')).toBeLessThan(0);
    expect(compareItems(item('a', 0), item('a', 0), 'usage')).toBe(0);
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

  describe('recent sort is frozen when nothing launches (round 5 acceptance test)', () => {
    // startedAtMs is immutable per process - the recent-sort order must not
    // move a single row across any number of ticks unless a process actually
    // starts or exits. current is randomized every tick (usage jitter must
    // never leak into a recency-sorted position).
    function launched(name: string, startedAtMs: number): Item {
      return { name, current: 0, values: [0], startedAtMs };
    }

    it('holds byte-identical order across many ticks of pure value churn', () => {
      const initial = [
        launched('a', 5000), launched('b', 4000), launched('c', 3000),
        launched('d', 2000), launched('e', 1000),
      ];
      let state = updateRanking(initRankState<Item>(), initial, 0, 'recent', RESET);
      const expected = names(state);
      expect(expected).toEqual(['a', 'b', 'c', 'd', 'e']);

      for (let tick = 1; tick <= 30; tick++) {
        const churned = initial.map(i => ({ ...i, current: Math.random() * 100 }));
        state = updateRanking(state, churned, tick, 'recent', OPTS);
        expect(names(state)).toEqual(expected);
      }
    });

    it('a newly-launched process inserts at its recency position without moving any existing row', () => {
      const initial = [launched('old1', 5000), launched('old2', 3000)];
      let state = updateRanking(initRankState<Item>(), initial, 0, 'recent', RESET);
      expect(names(state)).toEqual(['old1', 'old2']);

      // Newest launch (highest startedAtMs) - must land first, existing rows untouched.
      state = updateRanking(state, [...initial, launched('newest', 9000)], 1, 'recent', OPTS);
      expect(names(state)).toEqual(['newest', 'old1', 'old2']);
    });
  });

  describe('performance at scale (item 37: full process list, no top-N wire cap)', () => {
    // Generous enough to never flake under contention (this workspace runs
    // several concurrent agent sessions sharing one machine - see
    // .agents/rules/failure-log.md's entries on multi-session slowdown),
    // tight enough to catch an accidental O(n^2)/O(n^3) regression (either
    // would blow well past this at n=300, even given how cheap each
    // comparison is).
    const BUDGET_MS = 400;

    function manyItems(n: number): Item[] {
      return Array.from({ length: n }, (_, i) => item(`proc-${i}.exe`, Math.random() * 100));
    }

    it('a full re-rank (forceReset) at 300 entries stays fast', () => {
      const items = manyItems(300);
      const start = performance.now();
      const state = updateRanking(initRankState<Item>(), items, 0, 'usage', RESET);
      const elapsed = performance.now() - start;
      expect(state.order.length).toBe(300);
      expect(elapsed).toBeLessThan(BUDGET_MS);
    });

    it('a steady-state value-only update at 300 entries (the common per-tick case) stays fast', () => {
      const items = manyItems(300);
      let state = updateRanking(initRankState<Item>(), items, 0, 'usage', RESET);
      const churned = items.map(i => ({ ...i, current: Math.random() * 100 }));

      const start = performance.now();
      state = updateRanking(state, churned, 1, 'usage', OPTS);
      const elapsed = performance.now() - start;
      expect(state.order.length).toBe(300);
      expect(elapsed).toBeLessThan(BUDGET_MS);
    });
  });
});
