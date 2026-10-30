import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePageSync } from './usePageSync';
import type { PanelLayout } from '../types';

const page = (id: string) => ({ id, widgets: [] });
const layoutOf = (ids: string[], activePageId?: string): PanelLayout => ({
  layoutSchemaVersion: 2, surface: 'y70', pages: ids.map(page), activePageId,
});

function mount(stored: string[], shown: string[], activePageId?: string) {
  const setLayout = vi.fn();
  const paginated = layoutOf(stored);
  const hook = renderHook(
    ({ layout }) => usePageSync({
      loaded: true, kioskBehavior: true, paginatedLayout: paginated, layout, setLayout,
      pageCount: shown.length, pageDragging: false, blankPageIndex: -1, shownPageIds: shown,
    }),
    { initialProps: { layout: layoutOf(stored, activePageId) } },
  );
  return { ...hook, setLayout, paginated };
}

describe('usePageSync with hidden pages (Restricted mode)', () => {
  it('a swipe to the last shown page writes that page id, not the hidden one before it', () => {
    const { result, setLayout } = mount(['A', 'E', 'B'], ['A', 'B']);
    act(() => result.current.handlePageChange(1));
    expect(setLayout).toHaveBeenCalledWith(expect.objectContaining({ activePageId: 'B' }));
  });

  it('a remote page id lands on the matching shown page', () => {
    const stored = ['A', 'E', 'B', 'C'];
    const shown = ['A', 'B', 'C'];
    const { result, rerender, paginated } = mount(stored, shown);
    act(() => rerender({ layout: { ...layoutOf(stored, 'B'), pages: paginated.pages } }));
    expect(result.current.activePageIndex).toBe(1);
  });
});
