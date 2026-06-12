import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelLayout } from '../types';

// Owns the active page index and keeps it in sync with layout.activePageId so
// the device-page preview, the on-device panel, and sibling tabs track the same
// page. Also exposes refs the dnd handlers + collision detector read without
// re-subscribing.
export function usePageSync(params: {
  loaded: boolean;
  kioskBehavior: boolean;
  paginatedLayout: PanelLayout;
  layout: PanelLayout;
  setLayout: (next: PanelLayout) => void;
  pageCount: number;
  pageDragging: boolean;
}) {
  const { loaded, kioskBehavior, paginatedLayout, layout, setLayout, pageCount, pageDragging } = params;
  const [activePageIndex, setActivePageIndex] = useState(0);
  useEffect(() => {
    if (activePageIndex > pageCount - 1) setActivePageIndex(pageCount - 1);
  }, [activePageIndex, pageCount]);
  // Read in dnd handlers (edge-advance) without restarting the pointermove
  // subscription on every page change.
  const pageCountRef = useRef(pageCount);
  useEffect(() => { pageCountRef.current = pageCount; }, [pageCount]);
  // Active page index mirrored to a ref so the once-built collision detector
  // reads it without rebuilding. The detector locks the snap target to this
  // page; the pager's edge-advance dwell handles cross-page navigation, so
  // the snap never picks a cell on another page from a drifting rect.
  const activePageIndexRef = useRef(activePageIndex);
  useEffect(() => { activePageIndexRef.current = activePageIndex; }, [activePageIndex]);

  // --- Current-page sync via layout.activePageId ---------------------------
  // The active page rides in the layout so the device-page preview, the
  // on-device panel, and sibling tabs track the same page (propagated by the
  // panel/device refetch path, same as widget moves). Page changes never
  // survive a relaunch: a fresh panel start shows the first page.
  //
  // Honoring an external page (effect below) and persisting a local page
  // (handlePageChange) are kept strictly apart. An earlier version reacted to
  // activePageIndex with a *write* effect; because setActivePageIndex hadn't
  // applied yet in the same commit, that effect read the stale index and wrote
  // the previous page back, ping-ponging the two effects. The persist now
  // lives at the pager's onActiveChange, which fires only on a user swipe and
  // carries the new index explicitly, so no effect both reads the index and
  // writes the layout from it.
  const pageBootRef = useRef(false);
  const lastSeenPageIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!loaded || pageDragging) return;
    const pages = paginatedLayout.pages;
    if (pages.length === 0) return;
    if (!pageBootRef.current) {
      pageBootRef.current = true;
      if (kioskBehavior && pages.length > 1) {
        // Fresh panel start: show the first page and clear any page the last
        // session left in the record.
        lastSeenPageIdRef.current = pages[0].id;
        if (activePageIndex !== 0) setActivePageIndex(0);
        if (layout.activePageId !== pages[0].id) setLayout({ ...layout, activePageId: pages[0].id });
      } else {
        // Viewer (device-page preview / simulator) or single-page kiosk: adopt
        // whatever page the record already points at.
        lastSeenPageIdRef.current = layout.activePageId;
        const idx = layout.activePageId ? pages.findIndex(p => p.id === layout.activePageId) : 0;
        if (idx > 0 && idx !== activePageIndex) setActivePageIndex(idx);
      }
      return;
    }
    // Post-boot: honor a page change pushed from another client only. Skipped
    // during a drag so edge-advance owns the page.
    const target = layout.activePageId;
    if (!target || target === lastSeenPageIdRef.current) return;
    lastSeenPageIdRef.current = target;
    const idx = pages.findIndex(p => p.id === target);
    if (idx >= 0 && idx !== activePageIndex) setActivePageIndex(idx);
  }, [loaded, kioskBehavior, paginatedLayout, layout, pageDragging, activePageIndex, setLayout]);

  // Persist a user-driven page change (swipe) into the layout so other clients
  // follow. Carries the new index from the pager so it never reads a stale
  // render value, and marks it seen so the honor effect won't echo it back.
  const handlePageChange = useCallback((idx: number) => {
    setActivePageIndex(idx);
    const pages = paginatedLayout.pages;
    if (pages.length <= 1) return;
    const id = pages[Math.min(Math.max(idx, 0), pages.length - 1)]?.id;
    if (!id) return;
    lastSeenPageIdRef.current = id;
    if (layout.activePageId !== id) setLayout({ ...layout, activePageId: id });
  }, [paginatedLayout, layout, setLayout]);

  return { activePageIndex, setActivePageIndex, activePageIndexRef, pageCountRef, handlePageChange };
}
