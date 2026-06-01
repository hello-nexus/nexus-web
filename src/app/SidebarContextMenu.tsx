import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import styles from './SidebarContextMenu.module.scss';

interface SidebarMenuItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly danger?: boolean;
  readonly onSelect: () => void;
}

interface SidebarContextMenuProps {
  x: number;
  y: number;
  items: readonly SidebarMenuItem[];
  onClose: () => void;
}

export function SidebarContextMenu({ x, y, items, onClose }: SidebarContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [pos, setPos] = useState({ x, y });
  const [origin, setOrigin] = useState({ x: 12, y: 12 });
  const [closing, setClosing] = useState(false);

  const requestClose = useCallback(() => {
    if (closeTimerRef.current) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 120);
  }, [onClose]);

  // Clamp the popover so it never paints offscreen. Origin tracks the
  // click point relative to the (possibly nudged) menu rect so the
  // open animation scales from the cursor instead of a fixed corner.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - pad) nx = window.innerWidth - rect.width - pad;
    if (ny + rect.height > window.innerHeight - pad) ny = window.innerHeight - rect.height - pad;
    if (nx < pad) nx = pad;
    if (ny < pad) ny = pad;
    // Measure-after-render: clamping needs the painted rect, unavailable in
    // useMemo.
    setPos({ x: nx, y: ny });
    const cx = clamp(x - nx, 8, rect.width - 8);
    const cy = clamp(y - ny, 8, rect.height - 8);
    setOrigin({ x: cx, y: cy });
  }, [x, y]);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        requestClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
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

  const runAndClose = (action: () => void) => {
    action();
    requestClose();
  };

  const style: CSSProperties = {
    left: pos.x,
    top: pos.y,
    '--menu-origin-x': `${origin.x}px`,
    '--menu-origin-y': `${origin.y}px`,
  } as CSSProperties;

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      data-state={closing ? 'closing' : 'open'}
      style={style}
      role="menu"
    >
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={item.danger ? `${styles.item} ${styles.itemDanger}` : styles.item}
          onClick={() => runAndClose(item.onSelect)}
        >
          <span className={styles.itemIcon} aria-hidden>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
