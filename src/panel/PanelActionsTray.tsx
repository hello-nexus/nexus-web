import { useCallback, useEffect, useRef } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { usePanelTraySwipe } from './engine/usePanelTraySwipe';
import { isNativeApp } from './panelNativeBridge';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import styles from './PanelActionsTray.module.scss';

interface PanelActionsTrayProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAddWidget: () => void;
  onSettings?: () => void;
  onPair?: () => void;
  pairAvailable: boolean;
  // Surface element the swipe-up gesture binds to. The hook walks
  // touch targets for [data-panel-scrollable="true"] ancestors and
  // yields to the widget's own scroller when found.
  surfaceRef: React.RefObject<HTMLElement | null>;
  // Disable interactions (sheet open, immersive, offline).
  disabled?: boolean;
  // When true, the tray is always rendered open (editor preview).
  pinnedOpen?: boolean;
  // OS-reported computer name shown above the action buttons. Empty
  // string hides the label.
  machineName?: string;
}

export function PanelActionsTray({
  open,
  onOpen,
  onClose,
  onAddWidget,
  onSettings,
  onPair,
  pairAvailable,
  surfaceRef,
  disabled = false,
  pinnedOpen = false,
  machineName,
}: PanelActionsTrayProps) {
  const trayRef = useRef<HTMLDivElement | null>(null);

  const handleCommit = useCallback(() => {
    if (pinnedOpen) return;
    onOpen();
  }, [onOpen, pinnedOpen]);

  const swipe = usePanelTraySwipe({
    enabled: !disabled && !open && !pinnedOpen,
    surfaceRef,
    onCommit: handleCommit,
  });

  // Reset internal swipe state when the tray closes externally OR when
  // the host disables interactions mid-gesture - otherwise the hook tears
  // down its touch listeners without ever firing onEnd, leaving 'dragging'
  // and a non-zero offset latched and the scrim half-dimmed.
  useEffect(() => {
    if (!open || disabled) swipe.reset();
  }, [open, disabled, swipe]);

  const dragging = swipe.state === 'dragging' && !open && !pinnedOpen;
  // 80 is the visual "tray fully revealed" point and is intentionally
  // decoupled from commitDistancePx (48): the scrim should be at full dim
  // when the tray is visually all the way up, not at the commit arming
  // distance.
  const dragProgress = dragging ? Math.min(1, swipe.offset / 80) : 0;
  const showScrim = (open && !pinnedOpen) || dragging;

  return (
    <>
      {showScrim && (
        <div
          className={styles.scrim}
          data-visible={open ? 'true' : undefined}
          data-dragging={dragging ? 'true' : undefined}
          style={dragging ? { opacity: dragProgress } : undefined}
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={trayRef}
        className={styles.tray}
        data-state={pinnedOpen || open ? 'open' : (swipe.state === 'dragging' ? 'dragging' : 'closed')}
        style={
          swipe.state === 'dragging' && !open
            // Track the finger 1:1 from fully hidden (translateY(100%))
            // toward fully visible (translateY(0)) as offset grows.
            // Clamp at 0 so an over-pull doesn't push the tray above its
            // natural top position. scale(var(--panel-ui-zoom, 1))
            // preserves the monitor-panel chrome scale; on phone it's
            // a no-op (the var falls back to 1).
            ? { transform: `translateY(max(0px, calc(100% - ${swipe.offset}px))) scale(var(--panel-ui-zoom, 1))` }
            : undefined
        }
        aria-label="Panel actions"
      >
        {machineName && (
          <div className={styles.connectedTo}>
            <span className={styles.connectedLabel}>Connected to</span>
            <span className={styles.connectedName}>{machineName}</span>
          </div>
        )}
        <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => { onAddWidget(); onClose(); }}
        >
          <Plus size={18} />
          <span>Add widget</span>
        </button>
        {onSettings && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => { onSettings(); onClose(); }}
          >
            <Settings2 size={18} />
            <span>Settings</span>
          </button>
        )}
        {/* The pairing button triggers a native pairing dialog that only
            exists inside the iOS app wrapper. In a plain browser it's a
            no-op, so hide the whole button unless we're running natively. */}
        {pairAvailable && onPair && isNativeApp() && (
          <HoverTooltip body="Pairing" side="top">
            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionButtonCompact}`}
              onClick={() => { onPair(); onClose(); }}
              aria-label="Pairing"
            >
              <span>Pairing</span>
            </button>
          </HoverTooltip>
        )}
        </div>
      </aside>
    </>
  );
}
