import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
}

interface DeviceContextMenuProps {
  x: number;
  y: number;
  items: DeviceMenuItem[];
  onClose: () => void;
}

export function DeviceContextMenu({ x, y, items, onClose }: DeviceContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [pos, setPos] = useState({ x, y });
  const [origin, setOrigin] = useState({ x: 18, y: 18 });
  const [closing, setClosing] = useState(false);

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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) requestClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('pointerdown', handler, true);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [requestClose]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  const menuStyle = {
    left: pos.x,
    top: pos.y,
    '--menu-origin-x': `${origin.x}px`,
    '--menu-origin-y': `${origin.y}px`,
  } as CSSProperties;

  return (
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
      {items.map(item => (
        <Fragment key={item.key}>
          <button
            type="button"
            className={item.highlighted ? `${styles.item} ${styles.itemAccent}` : styles.item}
            onClick={() => { item.onSelect(); requestClose(); }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
          {item.separatorAfter && <span className={styles.divider} aria-hidden />}
        </Fragment>
      ))}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
