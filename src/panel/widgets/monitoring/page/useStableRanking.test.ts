import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStableRanking } from './useStableRanking';
import type { RankableItem } from './processRanking';

interface Item extends RankableItem {
  values: number[];
}

function item(name: string, current: number): Item {
  return { name, current, values: [current] };
}

describe('useStableRanking', () => {
  it('sorts on the initial render', () => {
    const { result } = renderHook(() => useStableRanking([item('b', 10), item('a', 90)], 'usage', 'key'));
    expect(result.current.map(i => i.name)).toEqual(['a', 'b']);
  });

  it('does not reorder rows when a new items array carries only value changes', () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: Item[] }) => useStableRanking(items, 'usage', 'key'),
      { initialProps: { items: [item('b', 10), item('a', 90)] } },
    );
    expect(result.current.map(i => i.name)).toEqual(['a', 'b']);

    rerender({ items: [item('b', 99), item('a', 1)] });
    expect(result.current.map(i => i.name)).toEqual(['a', 'b']);
    expect(result.current.map(i => i.current)).toEqual([1, 99]);
  });

  it('retains a briefly-missing row instead of dropping it immediately', () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: Item[] }) => useStableRanking(items, 'usage', 'key'),
      { initialProps: { items: [item('a', 90), item('b', 10)] } },
    );
    rerender({ items: [item('a', 90)] });
    expect(result.current.map(i => i.name)).toEqual(['a', 'b']);
  });

  it('forces a full re-rank when the sort mode changes', () => {
    // A stable (memoized-equivalent) items reference across the rerender -
    // matching real callers, which always memoize `items` - so only `sort`
    // changes between renders.
    const stableItems = [item('b', 90), item('a', 10)];
    const { result, rerender } = renderHook(
      ({ sort }: { sort: 'usage' | 'name' }) => useStableRanking(stableItems, sort, 'key'),
      { initialProps: { sort: 'usage' as const } },
    );
    expect(result.current.map(i => i.name)).toEqual(['b', 'a']);
    rerender({ sort: 'name' });
    expect(result.current.map(i => i.name)).toEqual(['a', 'b']);
  });

  it('forces a full re-rank when resetKey changes, discarding a grace-held row', () => {
    const { result, rerender } = renderHook(
      ({ items, resetKey }: { items: Item[]; resetKey: string }) => useStableRanking(items, 'usage', resetKey),
      { initialProps: { items: [item('a', 90), item('b', 10)], resetKey: 'cpu' } },
    );
    rerender({ items: [item('a', 90)], resetKey: 'cpu' });
    expect(result.current.map(i => i.name)).toEqual(['a', 'b']);

    rerender({ items: [item('a', 90)], resetKey: 'gpu' });
    expect(result.current.map(i => i.name)).toEqual(['a']);
  });
});
