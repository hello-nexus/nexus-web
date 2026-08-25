import { useState } from 'react';

export interface FaderPager<T> {
  visible: T[];
  /** Page count; 1 when everything fits. */
  pages: number;
  page: number;
  /** False when everything fits - the caller renders no arrows at all. */
  paged: boolean;
  prev: () => void;
  next: () => void;
}

/**
 * Fixed-size pages for a row of controls that must not shrink below a touch
 * target. A row that overflows pages rather than scrolling: a panel kiosk gives
 * no scrollbar affordance, and silently cutting the list (what the displays
 * widget used to do) hides controls entirely.
 */
export function useFaderPager<T>(items: T[], perPage: number): FaderPager<T> {
  const [page, setPage] = useState(0);
  const size = Math.max(1, perPage);
  const pages = Math.max(1, Math.ceil(items.length / size));
  // Clamped rather than reset: losing a device on the last page should step
  // back a page, not throw the user to the front of the list.
  const current = Math.min(page, pages - 1);
  return {
    visible: items.slice(current * size, current * size + size),
    pages,
    page: current,
    paged: pages > 1,
    prev: () => setPage(p => Math.max(0, Math.min(p, pages - 1) - 1)),
    next: () => setPage(p => Math.min(pages - 1, p + 1)),
  };
}
