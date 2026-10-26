import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Tabs, type TabDef } from '../Tabs/Tabs';
import { Button } from '../Button/Button';
import { useTranslation } from '../../../lib/i18n';
import styles from './ViewHeader.module.scss';

interface ViewHeaderProps {
  // Page name. No longer rendered as a heading (the top bar shows it) - kept
  // only as the accessible label for the tab strip.
  title: string;
  tabs?: readonly TabDef[];
  activeTab?: string;
  onTabChange?: (key: string, origin?: HTMLButtonElement) => void;
  onTabHover?: (key: string | null) => void;
  tabsDisabled?: boolean;
  /** Right-aligned status in the tab rail at label height; it never adds a row,
   *  so it renders only when the header has a tab row (tabs, tabsAdjacent or
   *  tabActions). */
  actions?: ReactNode;
  /** Widget sitting immediately beside the tab bar, sharing the row's gap.
   *  Unlike `tabActions` it stays next to the tabs instead of pinning right. */
  tabsAdjacent?: ReactNode;
  /** Right-aligned widget sharing the tab row: the tab bar takes what it needs
   *  and this keeps its own width beside it. */
  tabActions?: ReactNode;
  /** Opt-in: left/right arrows at the row's end scroll tabs that overflow. */
  tabArrows?: boolean;
}

const SCROLL_STEP = 0.75;

// Scrolling tab strip with an arrow pair that shows only while the tabs overflow.
function ScrollableTabs({ children, activeTab, tabCount }: { children: ReactNode; activeTab?: string; tabCount: number }) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, atStart: true, atEnd: true });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { overflow: max > 1, atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft >= max - 1 };
    setEdges(prev => (prev.overflow === next.overflow && prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next));
  }, []);

  useLayoutEffect(() => { measure(); }, [measure, tabCount, children]);

  // Re-runs on resize: the first pass can precede final layout (sidebar, fonts).
  const revealActive = useCallback(() => {
    const el = scrollerRef.current;
    const tab = el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!el || !tab) return;
    const left = tab.offsetLeft;
    if (left < el.scrollLeft) el.scrollLeft = left;
    else if (left + tab.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = left + tab.offsetWidth - el.clientWidth;
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onResize = () => { revealActive(); measure(); };
    window.addEventListener('resize', onResize);
    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', onResize);
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize); };
  }, [measure, revealActive]);

  useEffect(() => { revealActive(); }, [revealActive, activeTab, tabCount]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = dir * el.clientWidth * SCROLL_STEP;
    if (typeof el.scrollTo === 'function') el.scrollTo({ left: el.scrollLeft + delta, behavior: 'smooth' });
    else el.scrollLeft += delta;
  };

  return (
    <>
      <div ref={scrollerRef} className={styles.tabsScroller} onScroll={measure}>{children}</div>
      {edges.overflow && (
        <div className={styles.tabArrows}>
          <Button size="sm" tone="ghost" icon={<ChevronLeft size={16} />} aria-label={t('common.tabs.scrollLeft')} disabled={edges.atStart} onClick={() => scrollBy(-1)} />
          <Button size="sm" tone="ghost" icon={<ChevronRight size={16} />} aria-label={t('common.tabs.scrollRight')} disabled={edges.atEnd} onClick={() => scrollBy(1)} />
        </div>
      )}
    </>
  );
}

// Page-level tabs use the shared Tabs primitive so every tab bar in the app
// reads as one control. Text-only and icon+text tabs both flow through the
// single component.

export function ViewHeader({ title, tabs, activeTab, onTabChange, onTabHover, tabsDisabled, actions, tabActions, tabsAdjacent, tabArrows }: ViewHeaderProps) {
  const hasTabs = !!tabs && tabs.length > 0;
  const hasTabRow = hasTabs || !!tabActions || !!tabsAdjacent;
  return (
    <header className={styles.header}>
      {hasTabRow && (
        <div className={styles.tabsRow}>
          {hasTabs && (() => {
            const tabsEl = (
              <Tabs
                tabs={tabs}
                activeKey={activeTab ?? ''}
                onChange={(k, origin) => onTabChange?.(k, origin)}
                onHover={onTabHover}
                disabled={tabsDisabled}
                className={styles.viewHeaderTabs}
                ariaLabel={title}
              />
            );
            return tabArrows
              ? <ScrollableTabs activeTab={activeTab} tabCount={tabs.length}>{tabsEl}</ScrollableTabs>
              : tabsEl;
          })()}
          {tabsAdjacent && (
            <div className={styles.tabsAdjacent}>{tabsAdjacent}</div>
          )}
          {(tabActions || actions) && (
            <div className={styles.tabActions}>
              {tabActions}
              {actions && <div className={styles.actionsInline}>{actions}</div>}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
