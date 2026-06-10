import { useCallback, useEffect, useRef } from 'react';
import { Lock, Plus, QrCode, Settings2 } from 'lucide-react';
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
  // OS-reported computer name shown above the buttons. Empty string hides it.
  machineName?: string;
  // True when this panel is a remote/paired session (a phone reaching the PC),
  // not a local hardwired kiosk. The "Connected to <PC> 🔒" line shows only
  // then — a hardwired display already knows what it's plugged into.
  remotePaired?: boolean;
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
  remotePaired = false,
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

  // Reset internal swipe state only on the transition into closed/disabled —
  // e.g. the tray dismissed externally or interactions disabled mid-gesture,
  // which tear down the hook's listeners without firing onEnd and leave
  // 'dragging' + a non-zero offset latched. Depend on the stable `reset`, NOT
  // the whole `swipe` object (new every render): the object form re-ran this
  // effect each render and, since `open` is false for the entire pre-commit
  // drag, reset the live offset on every touchmove — the tray would reveal,
  // snap back to the bottom, and only animate up from scratch on release.
  const { reset: resetSwipe } = swipe;
  useEffect(() => {
    if (!open || disabled) resetSwipe();
  }, [open, disabled, resetSwipe]);

  const dragging = swipe.state === 'dragging' && !open && !pinnedOpen;
  // 80 is the "tray fully revealed" point, decoupled from commitDistancePx
  // (48): the scrim reaches full dim when the tray is visually all the way
  // up, not at the commit-arming distance.
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
            // Track the finger 1:1 from translateY(100%) toward
            // translateY(0) as offset grows. Clamp at 0 so an over-pull
            // can't push the tray above its rest position.
            // scale(var(--panel-scale, 1)) preserves the monitor-panel
            // chrome scale (no-op on phone where the var is unset).
            ? { transform: `translateY(max(0px, calc(100% - ${swipe.offset}px))) scale(var(--panel-scale, 1))` }
            : undefined
        }
        aria-label="Panel actions"
      >
        {machineName && remotePaired && (
          <div className={styles.connectedTo}>
            <span className={styles.connectedLabel}>Connected to</span>
            <span className={styles.connectedName}>{machineName}</span>
            <Lock size={12} className={styles.connectedLock} aria-label="End-to-end encrypted" />
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
              <QrCode size={17} />
              <span>Pairing</span>
            </button>
          </HoverTooltip>
        )}
        </div>
      </aside>
    </>
  );
}
