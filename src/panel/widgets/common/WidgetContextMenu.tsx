import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, GripVertical, Maximize2, Monitor, Pin, Settings, Trash2 } from 'lucide-react';
import { SIZE_ICONS } from './SizeIcons';
import type { PanelWidgetSize } from '../../types';
import styles from './WidgetContextMenu.module.scss';

interface WidgetContextMenuProps {
  x: number;
  y: number;
  currentSize: PanelWidgetSize;
  sizes: PanelWidgetSize[];
  hasConfig: boolean;
  themeMode?: 'dark' | 'light';
  themeStyle?: CSSProperties;
  isRearranging?: boolean;
  onResize: (size: PanelWidgetSize) => void;
  onEdit: () => void;
  onRemove: () => void;
  onRearrange?: () => void;
  // Optional - only shown when the widget has an ImmersiveComponent
  // and the current orientation is supported. Caller owns the gating.
  onImmersive?: () => void;
  // Optional - only shown when the widget type supports the desktop surface
  // and we're invoked from the dashboard (not from a remote panel preview).
  // Pins a copy of the widget onto the floating desktop overlay.
  onAddToDesktop?: () => void;
  // Override for the danger button label. Defaults to "Remove"; the desktop
  // overlay passes "Unpin" since the widget is being detached from the
  // overlay rather than removed from the panel layout.
  removeLabel?: string;
  // Desktop-overlay-only checkbox row. When provided, renders an
  // "Always on top" item with a checkmark reflecting `alwaysOnTop`.
  alwaysOnTop?: boolean;
  onToggleAlwaysOnTop?: () => void;
  // Desktop-overlay-only callback fired with the menu's measured viewport
  // rect after it has clamped to the safe area, and again with `null` on
  // unmount. The desktop host uses this to keep its SetWindowRgn carve-out
  // aligned with the visible menu rather than the click point.
  onBoundsChange?: (rect: { x: number; y: number; w: number; h: number } | null) => void;
  onClose: () => void;
}

export function WidgetContextMenu({
  x, y,
  currentSize, sizes,
  hasConfig,
  themeMode = 'dark',
  themeStyle,
  isRearranging,
  onResize, onEdit, onRemove, onRearrange, onImmersive, onAddToDesktop, onClose,
  removeLabel,
  alwaysOnTop,
  onToggleAlwaysOnTop,
  onBoundsChange,
}: WidgetContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [pos, setPos] = useState({ x, y });
  const [origin, setOrigin] = useState({ x: 18, y: 18 });
  const [closing, setClosing] = useState(false);
  // Stable callback ref so the bounds reporter doesn't refire just because
  // the parent re-renders (the parent reacts to bounds updates with a layout
  // post-message, which would loop).
  const onBoundsChangeRef = useRef(onBoundsChange);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);

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
    const safeInsets = readSafeAreaInsets();
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - safeInsets.right) nx = window.innerWidth - rect.width - safeInsets.right;
    if (ny + rect.height > window.innerHeight - safeInsets.bottom) ny = window.innerHeight - rect.height - safeInsets.bottom;
    if (nx < safeInsets.left) nx = safeInsets.left;
    if (ny < safeInsets.top) ny = safeInsets.top;
    setPos({ x: nx, y: ny });
    setOrigin({
      x: clamp(x - nx, 16, rect.width - 16),
      y: clamp(y - ny, 16, rect.height - 16),
    });
    // offsetWidth/offsetHeight return the layout box without CSS transforms,
    // so the popover-rect carve-out reflects the menu's final settled size
    // rather than the scale(0.96) open-animation frame the layout effect
    // happens to observe.
    onBoundsChangeRef.current?.({ x: nx, y: ny, w: el.offsetWidth, h: el.offsetHeight });
  }, [x, y]);

  useEffect(() => () => { onBoundsChangeRef.current?.(null); }, []);

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
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  const runAndClose = useCallback((action: () => void) => {
    action();
    requestClose();
  }, [requestClose]);

  const menuStyle = {
    ...themeStyle,
    left: pos.x,
    top: pos.y,
    '--menu-origin-x': `${origin.x}px`,
    '--menu-origin-y': `${origin.y}px`,
  } as CSSProperties;

  return (
    <div
      ref={menuRef}
      className={`panel-root ${styles.menu}`}
      data-theme={themeMode}
      data-state={closing ? 'closing' : 'open'}
      style={menuStyle}
    >
      {sizes.length > 1 && (
        <>
          <div className={styles.sizeRow}>
            {sizes.map(size => {
              const Icon = SIZE_ICONS[size];
              const active = size === currentSize;
              return (
                <button
                  key={size}
                  type="button"
                  className={`${styles.sizeBtn} ${active ? styles.sizeBtnActive : ''}`}
                  onClick={() => runAndClose(() => onResize(size))}
                  aria-label={size}
                  title={size}
                >
                  {Icon ? <Icon width={18} height={18} /> : size}
                </button>
              );
            })}
          </div>
          <div className={styles.divider} />
        </>
      )}

      {onToggleAlwaysOnTop && (
        <button
          type="button"
          className={`${styles.item} ${alwaysOnTop ? styles.itemChecked : ''}`}
          onClick={() => runAndClose(onToggleAlwaysOnTop)}
        >
          <Pin size={14} />
          <span>Always on top</span>
          {alwaysOnTop && <Check size={14} className={styles.itemCheck} />}
        </button>
      )}

      {hasConfig && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onEdit)}>
          <Settings size={14} />
          <span>Edit</span>
        </button>
      )}

      {onImmersive && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onImmersive)}>
          <Maximize2 size={14} />
          <span>Immersive mode</span>
        </button>
      )}

      {onAddToDesktop && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onAddToDesktop)}>
          <Monitor size={14} />
          <span>Add to desktop</span>
        </button>
      )}

      {onRearrange && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onRearrange)}>
          <GripVertical size={14} />
          <span>{isRearranging ? 'Stop rearranging' : 'Rearrange'}</span>
        </button>
      )}

      <button type="button" className={`${styles.item} ${styles.itemDanger}`} onClick={() => runAndClose(onRemove)}>
        <Trash2 size={14} />
        <span>{removeLabel ?? 'Remove'}</span>
      </button>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

// Resolves env(safe-area-inset-*) to actual pixel values via a temporary
// padding probe. Reading the values off a custom property doesn't work:
// unregistered custom properties hold the raw token stream, so
// getComputedStyle returns the literal "max(8px, env(...))" string.
// Padding is a typed length property and its computed value is fully
// resolved, so we can parseFloat it. 8px floor matches the panel's
// own --panel-safe-* convention.
function readSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  const fallback = { top: 8, right: 8, bottom: 8, left: 8 };
  if (typeof document === 'undefined') return fallback;
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'visibility: hidden',
    'pointer-events: none',
    'padding-top: max(8px, env(safe-area-inset-top))',
    'padding-right: max(8px, env(safe-area-inset-right))',
    'padding-bottom: max(8px, env(safe-area-inset-bottom))',
    'padding-left: max(8px, env(safe-area-inset-left))',
  ].join(';');
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = {
    top: parseFloat(cs.paddingTop) || fallback.top,
    right: parseFloat(cs.paddingRight) || fallback.right,
    bottom: parseFloat(cs.paddingBottom) || fallback.bottom,
    left: parseFloat(cs.paddingLeft) || fallback.left,
  };
  document.body.removeChild(probe);
  return out;
}
