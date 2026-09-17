import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ExternalLink, Lock, Maximize2, Monitor, MonitorOff, Pencil, Pin, PinOff, Trash2, Unlock } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { SIZE_ICONS } from './SizeIcons';
import type { PanelSurface, PanelWidgetSize } from '../../types';
import styles from './WidgetContextMenu.module.scss';

interface WidgetContextMenuProps {
  x: number;
  y: number;
  currentSize: PanelWidgetSize;
  sizes: PanelWidgetSize[];
  hasConfig: boolean;
  surface?: PanelSurface;
  themeMode?: 'dark' | 'light';
  themeStyle?: CSSProperties;
  onResize: (size: PanelWidgetSize) => void;
  onEdit: () => void;
  onRemove: () => void;
  // Optional - only shown when the widget has an ImmersiveComponent
  // and the current orientation is supported. Caller owns the gating.
  onImmersive?: () => void;
  // Optional - only shown when the widget type supports the desktop surface
  // and we're invoked from the dashboard (not from a remote panel preview).
  // Pins a copy of the widget onto the floating desktop overlay.
  onAddToDesktop?: () => void;
  // Inverse of onAddToDesktop; shown when at least one overlay widget of
  // this type exists. Click removes every instance of this type from the
  // overlay. Caller wires one of the two per state, never both at once.
  onRemoveFromDesktop?: () => void;
  // Optional - only shown when the widget is one of the pinnable desktop
  // apps (matches isPinnableAppKey in app/sidebarAppKeys) AND isn't already
  // pinned. Pins this widget's "app page" onto the desktop sidebar.
  onPinToSidebar?: () => void;
  // Inverse of onPinToSidebar; shown when the widget is already pinned.
  // Click removes the sidebar entry. Caller wires one of the two, never both.
  onUnpinFromSidebar?: () => void;
  // Override for the danger button label. Defaults to "Remove"; the desktop
  // overlay passes "Unpin" since the widget is being detached from the
  // overlay rather than removed from the panel layout.
  removeLabel?: string;
  // Desktop-overlay-only checkbox row. When provided, renders an
  // "Always on top" item with a checkmark reflecting `alwaysOnTop`.
  alwaysOnTop?: boolean;
  onToggleAlwaysOnTop?: () => void;
  // Desktop-overlay-only lock controls. When onToggleLock is provided, the
  // menu renders a Lock/Unlock row (per `locked`) plus a Lock all / Unlock
  // all row; while `locked`, the move/edit/resize items (size row, Edit,
  // Immersive) are hidden. Remove stays available.
  locked?: boolean;
  onToggleLock?: () => void;
  onLockAll?: () => void;
  onUnlockAll?: () => void;
  // Desktop-overlay-only bottom action. Renders a separator + "Open
  // dashboard" shortcut at the foot of the menu when provided.
  onOpenDashboard?: () => void;
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
  surface,
  themeMode = 'dark',
  themeStyle,
  onResize, onEdit, onRemove, onImmersive,
  onAddToDesktop, onRemoveFromDesktop,
  onPinToSidebar, onUnpinFromSidebar,
  onClose,
  removeLabel,
  alwaysOnTop,
  onToggleAlwaysOnTop,
  locked,
  onToggleLock,
  onLockAll,
  onUnlockAll,
  onOpenDashboard,
  onBoundsChange,
}: WidgetContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [pos, setPos] = useState({ x, y });
  const [origin, setOrigin] = useState({ x: 18, y: 18 });
  const [closing, setClosing] = useState(false);
  // Stable callback ref so the bounds reporter doesn't refire on parent
  // re-render (the parent reacts to bounds with a layout post-message, which
  // would loop).
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
    // Measure-then-position: useLayoutEffect reads the rendered menu rect
    // and commits clamped coordinates before paint, so no off-screen flash.
     
    setPos({ x: nx, y: ny });
    setOrigin({
      x: clamp(x - nx, 16, rect.width - 16),
      y: clamp(y - ny, 16, rect.height - 16),
    });
    // offsetWidth/offsetHeight return the layout box without CSS transforms,
    // so the carve-out reflects the menu's final size, not the scale(0.96)
    // open-animation frame the layout effect observes.
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
      data-surface={surface}
      data-state={closing ? 'closing' : 'open'}
      style={menuStyle}
    >
      {sizes.length > 1 && !locked && (
        <>
          <div className={styles.sizeRow}>
            {sizes.map(size => {
              const Icon = SIZE_ICONS[size];
              const active = size === currentSize;
              return (
                <HoverTooltip key={size} body={size} side="top">
                  <button
                    type="button"
                    className={`${styles.sizeBtn} ${active ? styles.sizeBtnActive : ''}`}
                    onClick={() => runAndClose(() => onResize(size))}
                    aria-label={size}
                  >
                    {Icon ? <Icon width={18} height={18} /> : size}
                  </button>
                </HoverTooltip>
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
          <span>{t('panel.widget.menu.alwaysOnTop')}</span>
          {alwaysOnTop && <Check size={14} className={styles.itemCheck} />}
        </button>
      )}

      {onToggleLock && (
        <>
          <button type="button" className={styles.item} onClick={() => runAndClose(onToggleLock)}>
            {locked ? <Unlock size={14} /> : <Lock size={14} />}
            <span>{t(locked ? 'panel.widget.menu.unlock' : 'panel.widget.menu.lock')}</span>
          </button>
          {locked
            ? onUnlockAll && (
                <button type="button" className={styles.item} onClick={() => runAndClose(onUnlockAll)}>
                  <Unlock size={14} />
                  <span>{t('panel.widget.menu.unlockAll')}</span>
                </button>
              )
            : onLockAll && (
                <button type="button" className={styles.item} onClick={() => runAndClose(onLockAll)}>
                  <Lock size={14} />
                  <span>{t('panel.widget.menu.lockAll')}</span>
                </button>
              )}
        </>
      )}

      {hasConfig && !locked && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onEdit)}>
          <Pencil size={14} />
          <span>{t('panel.widget.menu.edit')}</span>
        </button>
      )}

      {onImmersive && !locked && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onImmersive)}>
          <Maximize2 size={14} />
          <span>{t('panel.widget.menu.immersive')}</span>
        </button>
      )}

      {onAddToDesktop && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onAddToDesktop)}>
          <Monitor size={14} />
          <span>{t('panel.widget.menu.addToDesktop')}</span>
        </button>
      )}

      {onRemoveFromDesktop && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onRemoveFromDesktop)}>
          <MonitorOff size={14} />
          <span>{t('panel.widget.menu.removeFromDesktop')}</span>
        </button>
      )}

      {onPinToSidebar && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onPinToSidebar)}>
          <Pin size={14} />
          <span>{t('sidebar.pin')}</span>
        </button>
      )}

      {onUnpinFromSidebar && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onUnpinFromSidebar)}>
          <PinOff size={14} />
          <span>{t('sidebar.unpin')}</span>
        </button>
      )}

      <button type="button" className={`${styles.item} ${styles.itemDanger}`} onClick={() => runAndClose(onRemove)}>
        <Trash2 size={14} />
        <span>{removeLabel ?? t('panel.widget.menu.remove')}</span>
      </button>

      {onOpenDashboard && (
        <>
          <div className={styles.divider} />
          <button type="button" className={styles.item} onClick={() => runAndClose(onOpenDashboard)}>
            <ExternalLink size={14} />
            <span>{t('panel.widget.menu.openDashboard')}</span>
          </button>
        </>
      )}
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
