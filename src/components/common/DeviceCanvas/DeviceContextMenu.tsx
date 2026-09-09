import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
// Reuse the panel widget menu's stylesheet.
import styles from '../../../panel/widgets/common/WidgetContextMenu.module.scss';

export interface DeviceMenuItem {
  key: string;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  /** Rule under this row, splitting it off from the rows below. */
  separatorAfter?: boolean;
  /** Accent-fills the row: it is the one that resolves the state the card is
   *  advertising. */
  highlighted?: boolean;
  /** Rows that fly out to the side. The row itself then only opens them, so
   *  `onSelect` is never called for it. */
  submenu?: DeviceMenuItem[];
}

interface DeviceContextMenuProps {
  x: number;
  y: number;
  items: DeviceMenuItem[];
  onClose: () => void;
}

export function DeviceContextMenu({ x, y, items, onClose }: DeviceContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [pos, setPos] = useState({ x, y });
  const [origin, setOrigin] = useState({ x: 18, y: 18 });
  const [closing, setClosing] = useState(false);
  // The open submenu, anchored on the row that owns it.
  const [sub, setSub] = useState<{ key: string; items: DeviceMenuItem[]; x: number; y: number } | null>(null);

  const requestClose = useCallback(() => {
    if (closeTimerRef.current) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 120);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    // Measure-then-position: clamp the menu into the viewport before paint so
    // it never flashes off-screen near a canvas edge.
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - margin) nx = window.innerWidth - rect.width - margin;
    if (ny + rect.height > window.innerHeight - margin) ny = window.innerHeight - rect.height - margin;
    if (nx < margin) nx = margin;
    if (ny < margin) ny = margin;
    setPos({ x: nx, y: ny });
    setOrigin({ x: clamp(x - nx, 16, rect.width - 16), y: clamp(y - ny, 16, rect.height - 16) });
  }, [x, y]);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || subRef.current?.contains(target)) return;
      requestClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape backs out one level, the way a classic menu does.
      if (sub) { setSub(null); return; }
      requestClose();
    };
    window.addEventListener('pointerdown', handler, true);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [requestClose, sub]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  const menuStyle = {
    left: pos.x,
    top: pos.y,
    '--menu-origin-x': `${origin.x}px`,
    '--menu-origin-y': `${origin.y}px`,
  } as CSSProperties;

  const openSub = (item: DeviceMenuItem, row: HTMLElement) => {
    if (!item.submenu || item.submenu.length === 0) return;
    const r = row.getBoundingClientRect();
    setSub({ key: item.key, items: item.submenu, x: r.right + 2, y: r.top - 10 });
  };

  const renderItems = (list: DeviceMenuItem[], nested: boolean) => list.map(item => (
    <Fragment key={item.key}>
      <button
        type="button"
        className={item.highlighted ? `${styles.item} ${styles.itemAccent}` : styles.item}
        aria-haspopup={item.submenu ? 'menu' : undefined}
        aria-expanded={item.submenu ? sub?.key === item.key : undefined}
        // Only a submenu row reacts to hover. Closing on a sibling would shut
        // the flyout the moment the pointer cut diagonally across the rows
        // between the parent and the panel it opened.
        onPointerEnter={e => { if (!nested && item.submenu) openSub(item, e.currentTarget); }}
        onClick={e => {
          // A parent row only opens its flyout; touch has no hover to do it.
          if (item.submenu) { openSub(item, e.currentTarget); return; }
          item.onSelect();
          requestClose();
        }}
      >
        {item.icon}
        <span>{item.label}</span>
        {item.submenu && <ChevronRight size={13} className={styles.itemChevron} aria-hidden />}
      </button>
      {item.separatorAfter && <span className={styles.divider} aria-hidden />}
    </Fragment>
  ));

  // Portaled to <body>: the menu is position:fixed, and a fixed element is
  // still positioned and stacked inside the nearest ancestor that creates a
  // stacking context. Both card families that host this menu create one - a
  // dimmed card (opacity < 1) and every dnd-kit sortable row (transform) - so
  // rendered in place the menu slid under neighbouring panels whatever
  // z-index it carried. React portals keep bubbling through the component
  // tree, so a host whose root handles clicks needs a
  // `currentTarget.contains(target)` guard - FanCard carries one; ZoneCard
  // does not, and a row click there flips the card's selection (pre-existing:
  // the menu bubbled the same way as a DOM child).
  return createPortal(
    <>
      <div
        ref={menuRef}
        // panel-root establishes the --panel-* CSS variables the reused menu
        // stylesheet relies on; the lighting page (where this renders) has no
        // panel-root ancestor on the desktop dashboard. data-surface="desktop"
        // opts out of the monitor-panel zoom-scale override.
        className={`panel-root ${styles.menu} ${styles.menuAutoWidth}`}
        data-surface="desktop"
        data-state={closing ? 'closing' : 'open'}
        style={menuStyle}
      >
        {renderItems(items, false)}
      </div>
      {sub && (
        <SubMenu
          ref={subRef}
          x={sub.x}
          y={sub.y}
          closing={closing}
          // Anchored to the right of its row, flipped when that would leave
          // the viewport, so a rail menu near the window edge still opens.
          flipFrom={pos.x}
        >
          {renderItems(sub.items, true)}
        </SubMenu>
      )}
    </>,
    document.body,
  );
}

function SubMenu({ ref, x, y, closing, flipFrom, children }: {
  ref: React.RefObject<HTMLDivElement | null>;
  x: number;
  y: number;
  closing: boolean;
  flipFrom: number;
  children: ReactNode;
}) {
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - margin) nx = Math.max(margin, flipFrom - rect.width - 2);
    if (ny + rect.height > window.innerHeight - margin) ny = window.innerHeight - rect.height - margin;
    if (ny < margin) ny = margin;
    setPos({ x: nx, y: ny });
  }, [ref, x, y, flipFrom]);

  return (
    <div
      ref={ref}
      className={`panel-root ${styles.menu} ${styles.menuAutoWidth}`}
      data-surface="desktop"
      data-state={closing ? 'closing' : 'open'}
      role="menu"
      style={{ left: pos.x, top: pos.y, '--menu-origin-x': '0px', '--menu-origin-y': '16px' } as CSSProperties}
    >
      {children}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
