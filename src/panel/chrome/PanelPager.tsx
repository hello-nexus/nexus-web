import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePanelHorizontalSwipe } from '../engine/usePanelHorizontalSwipe';
import styles from './PanelPager.module.scss';

interface PanelPagerProps<T extends { id: string }> {
  pages: T[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  swipeEnabled?: boolean;
  renderPage: (page: T, index: number, isActive: boolean) => ReactNode;
  className?: string;
}

export function PanelPager<T extends { id: string }>({
  pages,
  activeIndex,
  onActiveChange,
  swipeEnabled = true,
  renderPage,
  className,
}: PanelPagerProps<T>) {
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const safeIndex = Math.max(0, Math.min(pages.length - 1, activeIndex));
  const { offset, state, pageWidth } = usePanelHorizontalSwipe({
    enabled: swipeEnabled && pages.length > 1,
    pagerRef,
    pageCount: pages.length,
    activeIndex: safeIndex,
    onActiveChange,
  });

  // Ensure the active page snaps after a window resize that changes
  // pageWidth so the translate stays page-aligned.
  useEffect(() => {
    if (state !== 'idle') return;
    const el = pagerRef.current;
    if (!el) return;
    el.scrollLeft = 0;
  }, [pageWidth, state]);

  // Opening on page N shows it in place instead of sliding in from page 0: the
  // track transitions only after its first page-aligned position has been
  // style-resolved (the offsetWidth read), so that position never animates.
  const [placed, setPlaced] = useState(false);
  useLayoutEffect(() => {
    if (placed || pageWidth <= 0 || !trackRef.current) return;
    void trackRef.current.offsetWidth;
    setPlaced(true);
  }, [placed, pageWidth]);

  const baseTranslate = pageWidth > 0 ? -safeIndex * pageWidth : 0;
  const translateX = baseTranslate + offset;
  // Critical: do NOT set transform at rest on page 0. Any non-none transform
  // creates a containing block for fixed descendants, breaking the editor's
  // `position: fixed` docked widget (anchors to .track, hides under the scrim).
  // 2D translate, never translate3d: the 3D form pins the track to its own
  // composited layer for as long as it is off page 0, and a panel that scales
  // its content then stretches that layer's raster instead of painting the
  // text at the size it is shown. The stylesheet promotes the track only while
  // a swipe is actually running, which is the only time it buys anything.
  const trackStyle: CSSProperties | undefined = translateX !== 0
    ? { transform: `translate(${translateX}px, 0)` }
    : undefined;

  return (
    <div ref={pagerRef} className={`${styles.pager}${className ? ` ${className}` : ''}`}>
      <div ref={trackRef} className={styles.track} data-state={state} data-placed={placed || undefined} style={trackStyle}>
        {pages.map((page, idx) => (
          <div
            key={page.id}
            className={styles.page}
            data-panel-page-index={idx}
            data-panel-page-id={page.id}
            aria-hidden={idx !== safeIndex}
          >
            {renderPage(page, idx, idx === safeIndex)}
          </div>
        ))}
      </div>
    </div>
  );
}
