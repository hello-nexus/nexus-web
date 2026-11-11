import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import classNames from 'classnames';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { Button } from '../Button/Button';
import { useTranslation } from '../../../lib/i18n';
import { computeEdges, revealOffset, scrollDelta, type OverflowEdges } from './tabOverflow';
import styles from './Tabs.module.scss';

export interface TabDef {
  readonly key: string;
  /** Text or arbitrary node. Accepting ReactNode lets callers inline a badge
   *  / indicator (like the Effect-tab dot in Lighting) without forcing every
   *  consumer to add its own className plumbing. */
  readonly label: ReactNode;
  /** Optional leading icon rendered with the same spacing across every tab bar. */
  readonly icon?: ReactNode;
  /** Per-tab disable. Takes precedence over the `disabled` root flag. */
  readonly disabled?: boolean;
  /** Accessible name for a tab whose label carries no text (icon-only). */
  readonly ariaLabel?: string;
  /** Wraps the tab's content in the sidebar section-header pill (Apps /
   *  Devices), marking it as a control rather than one more page tab. */
  readonly chip?: boolean;
  /** Marks the tab as a menu trigger and carries the menu's open state, so a
   *  tab that drops a popup announces itself as one (the lighting / cooling
   *  mode tab). Omit for a plain tab. */
  readonly expanded?: boolean;
  /** Hover tooltip body for the tab's button. Omit for no tooltip. */
  readonly tooltip?: string;
  /** Optional trailing control, right-aligned after the label (e.g. a per-tab
   *  pause toggle). Rendered as a DOM sibling of the tab's own `<button>`,
   *  inside a shared visual pill - never a descendant of it. A focusable
   *  control nested inside a `<button>` is invalid ARIA (buttons are leaf
   *  controls; assistive tech won't expose a descendant as separately
   *  reachable) on top of forbidding literal `<button>`-in-`<button>` HTML -
   *  see Card's `disableInteractiveRole` for the same constraint elsewhere.
   *  A click/keydown on it is stopped from bubbling into the tab's onChange. */
  readonly trailing?: ReactNode;
}

export interface TabsProps {
  tabs: readonly TabDef[];
  activeKey: string;
  onChange: (key: string, origin: HTMLButtonElement) => void;
  /** Disables every tab. Use TabDef.disabled for a single tab. */
  disabled?: boolean;
  /** aria-label for the <nav> element. Defaults to "Tabs" if omitted. */
  ariaLabel?: string;
  /** Optional extra class on the outer host (strip plus scroll arrows), e.g. for tighter margins in constrained layouts. */
  className?: string;
  /** Stretch the bar to 100% width with each tab sharing the width equally. */
  fullWidth?: boolean;
  /** Mouse hover over a tab, null on leave. Touch and pen never fire it. */
  onHover?: (key: string | null) => void;
}

function withTooltip(tab: TabDef, button: ReactElement): ReactElement {
  return tab.tooltip ? <HoverTooltip key={tab.key} body={tab.tooltip} side="bottom">{button}</HoverTooltip> : button;
}

/**
 * Horizontal tab bar - the canonical tab affordance across the app. Flat at
 * rest; the active tab carries the --bg pill (overridable per surface through
 * --tab-active-bg), and inactive tabs are neutral-dim and hover to plain text.
 * Text-only and icon+text tabs both flow through this one component.
 */
export function Tabs({ tabs, activeKey, onChange, disabled, ariaLabel = 'Tabs', className, fullWidth = false, onHover }: TabsProps) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<OverflowEdges>({ overflow: false, atStart: true, atEnd: true });
  const navClass = classNames(styles.tabs, fullWidth && styles.fullWidth);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = computeEdges(el.scrollLeft, el.scrollWidth, el.clientWidth);
    setEdges(prev => (prev.overflow === next.overflow && prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next));
  }, []);

  // Re-runs on resize: the first pass can precede final layout (sidebar, fonts).
  const revealActive = useCallback(() => {
    const el = scrollerRef.current;
    const tab = el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!el || !tab) return;
    // A grouped tab (trailing control) reveals its whole pill.
    const target = tab.parentElement?.getAttribute('role') === 'presentation' ? tab.parentElement : tab;
    el.scrollLeft = revealOffset(el.scrollLeft, el.clientWidth, target.offsetLeft, target.offsetWidth);
  }, []);

  useLayoutEffect(() => { measure(); });

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

  useEffect(() => { revealActive(); }, [revealActive, activeKey, tabs.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = scrollDelta(dir, el.clientWidth);
    if (typeof el.scrollTo === 'function') el.scrollTo({ left: el.scrollLeft + delta, behavior: 'smooth' });
    else el.scrollLeft += delta;
  };
  const hoverProps = (key: string) => onHover ? {
    onPointerEnter: (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') onHover(key); },
    onPointerLeave: (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') onHover(null); },
  } : {};
  return (
    <div className={classNames(styles.host, fullWidth && styles.hostFull, className)}>
      <div ref={scrollerRef} className={styles.scroller} onScroll={measure}>
    <nav className={navClass} role="tablist" aria-label={ariaLabel}>
      {tabs.map(tab => {
        const isActive = tab.key === activeKey;
        // No trailing control: the button alone is the flex item, byte-for-byte
        // the same markup every existing caller already renders.
        if (!tab.trailing) {
          return withTooltip(tab, (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={tab.ariaLabel}
              aria-haspopup={tab.expanded === undefined ? undefined : 'menu'}
              aria-expanded={tab.expanded}
              className={classNames(styles.tab, { [styles.active]: isActive })}
              disabled={disabled || tab.disabled}
              onClick={e => onChange(tab.key, e.currentTarget)}
              {...hoverProps(tab.key)}
            >
              <span className={classNames(styles.tabInner, { [styles.tabChip]: tab.chip })}>
                {tab.icon && <span className={styles.tabIcon} aria-hidden="true">{tab.icon}</span>}
                <span className={styles.tabLabel}>{tab.label}</span>
              </span>
            </button>
          ));
        }
        // With a trailing control, the tab becomes a flex-item group: the
        // button and the trailing control are siblings sharing one pill, not
        // parent/child, so the trailing control stays a separately reachable
        // focus target instead of a descendant of the tab's own button.
        return (
          <span key={tab.key} role="presentation" className={classNames(styles.tabGroup, { [styles.active]: isActive })}>
            {withTooltip(tab, <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={tab.ariaLabel}
              aria-haspopup={tab.expanded === undefined ? undefined : 'menu'}
              aria-expanded={tab.expanded}
              className={styles.tab}
              disabled={disabled || tab.disabled}
              onClick={e => onChange(tab.key, e.currentTarget)}
              {...hoverProps(tab.key)}
            >
              <span className={classNames(styles.tabInner, { [styles.tabChip]: tab.chip })}>
                {tab.icon && <span className={styles.tabIcon} aria-hidden="true">{tab.icon}</span>}
                <span className={styles.tabLabel}>{tab.label}</span>
              </span>
            </button>)}
            <span className={styles.tabTrailing}>
              {tab.trailing}
            </span>
          </span>
        );
      })}
    </nav>
      </div>
      {edges.overflow && (
        <div className={styles.arrows}>
          <Button size="sm" tone="ghost" icon={<ChevronLeft size={16} />} aria-label={t('common.tabs.scrollLeft')} disabled={edges.atStart} onClick={() => scrollBy(-1)} />
          <Button size="sm" tone="ghost" icon={<ChevronRight size={16} />} aria-label={t('common.tabs.scrollRight')} disabled={edges.atEnd} onClick={() => scrollBy(1)} />
        </div>
      )}
    </div>
  );
}
