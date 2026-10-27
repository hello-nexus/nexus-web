import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ExternalLink, Lock, Maximize2, Monitor, Pencil, Pin, PinOff, Plus, Scaling, SlidersHorizontal, Trash2 } from 'lucide-react';
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
  // Starts corner-drag resize mode; the caller offers it only where the widget has more than one size to snap to.
  onResizeMode?: () => void;
  onEdit: () => void;
  onRemove: () => void;
  // Optional - only shown when the widget has an ImmersiveComponent
  // and the current orientation is supported. Caller owns the gating.
  onImmersive?: () => void;
  // Dashboard only: the active display panels a copy of the widget can be added to.
  displayTargets?: { id: string; name: string; number: string }[];
  onAddToDisplay?: (displayId: string) => void;
  // Opens the add-widget catalog; offered on panels edited with a mouse.
  onAddWidget?: () => void;
  // Optional - only shown when the widget is one of the pinnable desktop
  // apps (matches isPinnableAppKey in app/sidebarAppKeys) AND isn't already
  // pinned. Pins this widget's "app page" onto the desktop sidebar.
  onPinToSidebar?: () => void;
  // Inverse of onPinToSidebar; shown when the widget is already pinned.
  // Click removes the sidebar entry. Caller wires one of the two, never both.
  onUnpinFromSidebar?: () => void;
  // When provided, renders an "Always on top" item with a checkmark reflecting `alwaysOnTop`.
  alwaysOnTop?: boolean;
  // Shown but inert: the panel's background does not allow it.
  alwaysOnTopDisabled?: boolean;
  onToggleAlwaysOnTop?: () => void;
  // Opens the panel menu from a widget, for panels whose empty space passes clicks through.
  onOpenPanelActions?: () => void;
  // Panel-wide widget lock. When onToggleLock is provided the menu renders a checked
  // "Lock widgets" row; while `locked`, the edit and resize items are hidden.
  locked?: boolean;
  onToggleLock?: () => void;
  // Opens the widget's page or editor in the app; offered on generic display panels for widgets that have one.
  onOpen?: () => void;
  // Dashboard order: Edit, Resize and Remove sit last, under the display and sidebar items.
  widgetItemsLast?: boolean;
  onClose: () => void;
}

export function WidgetContextMenu({
  x, y,
  currentSize, sizes,
  hasConfig,
  surface,
  themeMode = 'dark',
  themeStyle,
  onResize, onResizeMode, onEdit, onRemove, onImmersive,
  displayTargets, onAddToDisplay, onAddWidget,
  onPinToSidebar, onUnpinFromSidebar,
  onOpenPanelActions,
  onOpen,
  widgetItemsLast,
  onClose,
  alwaysOnTop,
  alwaysOnTopDisabled,
  onToggleAlwaysOnTop,
  locked,
  onToggleLock,
}: WidgetContextMenuProps) {
  const { t } = useTranslation();
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
    // A synchronous read sees the open keyframe's first frame, which is
    // smaller than the resting box. Only an !important declaration outranks a
    // running animation, so pin the resting transform for the read; the
    // animation itself is untouched (no restart, safe while closing).
    el.style.setProperty('transform', 'scale(var(--_menu-scale))', 'important');
    const rect = el.getBoundingClientRect();
    el.style.removeProperty('transform');
    const safeInsets = readSafeAreaInsets();
    // The painted (scaled) menu is what must stay on screen.
    let px = x;
    let py = y;
    if (px + rect.width > window.innerWidth - safeInsets.right) px = window.innerWidth - rect.width - safeInsets.right;
    if (py + rect.height > window.innerHeight - safeInsets.bottom) py = window.innerHeight - rect.height - safeInsets.bottom;
    if (px < safeInsets.left) px = safeInsets.left;
    if (py < safeInsets.top) py = safeInsets.top;
    // transform-origin is in unscaled px and scaling about it moves the painted
    // edge, so the layout box is offset to keep the painted box at (px, py).
    const sx = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
    const sy = el.offsetHeight > 0 ? rect.height / el.offsetHeight : 1;
    const ox = clamp((x - px) / sx, 16, el.offsetWidth - 16);
    const oy = clamp((y - py) / sy, 16, el.offsetHeight - 16);
    const nx = px + ox * (sx - 1);
    const ny = py + oy * (sy - 1);
    // Measure-then-position: useLayoutEffect reads the rendered menu rect
    // and commits clamped coordinates before paint, so no off-screen flash.

    setPos({ x: nx, y: ny });
    setOrigin({ x: ox, y: oy });
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
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  const runAndClose = useCallback((action: () => void) => {
    action();
    requestClose();
  }, [requestClose]);

  const editItems = (
    <>
      {hasConfig && !locked && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onEdit)}>
          <Pencil size={14} />
          <span>{t('panel.widget.menu.edit')}</span>
        </button>
      )}

      {onResizeMode && !locked && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onResizeMode)}>
          <Scaling size={14} />
          <span>{t('panel.widget.menu.resize')}</span>
        </button>
      )}
    </>
  );
  const hasMiddleItems = Boolean(onImmersive || (onAddToDisplay && displayTargets?.length) || onPinToSidebar || onUnpinFromSidebar);

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
      className={`panel-root ${styles.menu} ${styles.menuAutoWidth}`}
      data-theme={themeMode}
      data-surface={surface}
      data-state={closing ? 'closing' : 'open'}
      data-panel-hit="true"
      style={menuStyle}
    >
      {onOpen && (
        <>
          <button type="button" className={styles.item} onClick={() => runAndClose(onOpen)}>
            <ExternalLink size={14} />
            <span>{t('search.kind.open')}</span>
          </button>
          <div className={styles.divider} />
        </>
      )}

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

      {!widgetItemsLast && editItems}

      {onImmersive && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onImmersive)}>
          <Maximize2 size={14} />
          <span>{t('panel.widget.menu.immersive')}</span>
        </button>
      )}

      {onAddToDisplay && displayTargets?.map(target => (
        <button key={target.id} type="button" className={styles.item} onClick={() => runAndClose(() => onAddToDisplay(target.id))}>
          <Monitor size={14} />
          <span>{displayTargets.length > 1 ? t('panel.widget.menu.addToDisplayNamed', { name: t('displays.numberedName', { name: target.name, n: target.number }) }) : t('panel.widget.menu.addToDisplay')}</span>
        </button>
      ))}

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

      {widgetItemsLast && hasMiddleItems && <div className={styles.divider} />}
      {widgetItemsLast && editItems}

      <button type="button" className={`${styles.item} ${styles.itemDanger}`} onClick={() => runAndClose(onRemove)}>
        <Trash2 size={14} />
        <span>{t('panel.widget.menu.remove')}</span>
      </button>

      {/* Groups in order: widget items, view toggles, panel-wide items; a divider only between non-empty groups. */}
      {(onToggleLock || onToggleAlwaysOnTop) && <div className={styles.divider} />}

      {onToggleLock && (
        <button
          type="button"
          className={`${styles.item} ${locked ? styles.itemChecked : ''}`}
          onClick={() => runAndClose(onToggleLock)}
        >
          <Lock size={14} />
          <span>{t('panel.widget.menu.lockWidgets')}</span>
          {locked && <Check size={14} className={styles.itemCheck} />}
        </button>
      )}

      {onToggleAlwaysOnTop && (
        <button
          type="button"
          className={`${styles.item} ${alwaysOnTop ? styles.itemChecked : ''}`}
          disabled={alwaysOnTopDisabled}
          onClick={() => runAndClose(onToggleAlwaysOnTop)}
        >
          <Pin size={14} />
          <span>{t('panel.widget.menu.alwaysOnTop')}</span>
          {alwaysOnTop && <Check size={14} className={styles.itemCheck} />}
        </button>
      )}

      {(onAddWidget || onOpenPanelActions) && <div className={styles.divider} />}

      {onAddWidget && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onAddWidget)}>
          <Plus size={14} />
          <span>{t('panel.widget.menu.addWidget')}</span>
        </button>
      )}

      {onOpenPanelActions && (
        <button type="button" className={styles.item} onClick={() => runAndClose(onOpenPanelActions)}>
          <SlidersHorizontal size={14} />
          <span>{t('panel.actions.label')}</span>
        </button>
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
