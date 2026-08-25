import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFaderPager } from './useFaderPager';

const items = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('useFaderPager', () => {
  it('reports no paging when everything fits', () => {
    const { result } = renderHook(() => useFaderPager(items(4), 4));
    expect(result.current.paged).toBe(false);
    expect(result.current.pages).toBe(1);
    expect(result.current.visible).toHaveLength(4);
  });

  it('pages once the row overflows', () => {
    const { result } = renderHook(() => useFaderPager(items(6), 4));
    expect(result.current.paged).toBe(true);
    expect(result.current.visible).toEqual([0, 1, 2, 3]);

    act(() => result.current.next());
    expect(result.current.visible).toEqual([4, 5]);
  });

  it('stops at each end', () => {
    const { result } = renderHook(() => useFaderPager(items(6), 4));
    act(() => result.current.prev());
    expect(result.current.page).toBe(0);
    act(() => { result.current.next(); result.current.next(); });
    expect(result.current.page).toBe(1);
  });

  it('steps back a page when the list shrinks under the cursor', () => {
    // An app closing on the last page must not throw the user to the front.
    const { result, rerender } = renderHook(({ n }) => useFaderPager(items(n), 4), {
      initialProps: { n: 9 },
    });
    act(() => { result.current.next(); result.current.next(); });
    expect(result.current.page).toBe(2);

    rerender({ n: 6 });
    expect(result.current.page).toBe(1);
    expect(result.current.visible).toEqual([4, 5]);
  });
});
