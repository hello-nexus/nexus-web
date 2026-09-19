import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Lock, Plus, QrCode, Settings2 } from 'lucide-react';
import { usePanelTraySwipe } from '../engine/usePanelTraySwipe';
import { cssPxPerMm } from '../engine/panelGrid';
import { TRAY_COMMIT_FLICK_MM_PER_MS, TRAY_COMMIT_TRAVEL_MM, TRAY_ENGAGE_TRAVEL_MM } from '../engine/gestureThresholds';
import { isNativeApp } from '../device/panelNativeBridge';
import { HoverTooltip } from '../../components/common/HoverTooltip/HoverTooltip';
import { Button } from '../../components/common/Button/Button';
import { useTranslation } from '../../lib/i18n';
import type { PanelSurface } from '../types';
import styles from './PanelActionsTray.module.scss';

interface PanelActionsTrayProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAddWidget: () => void;
  onSettings?: () => void;
  onPair?: () => void;
  pairAvailable: boolean;
  // Opens the in-panel pairing sheet: on a local hardwired kiosk (Y70, touch
  // monitor) this PC's authorized-devices list, on a phone surface the
  // phone's own remembered-PCs list. Distinct from onPair, which triggers the
  // native app's OS dialog.
  onPairSheet?: () => void;
  pairSheetAvailable?: boolean;
  // Surface element the swipe-up gesture binds to. The hook walks
  // touch targets for [data-panel-scrollable="true"] ancestors and
  // yields to the widget's own scroller when found.
  surfaceRef: React.RefObject<HTMLElement | null>;
  // Panel surface kind, used to convert the open-gesture thresholds from
  // physical finger travel to this surface's CSS px (see cssPxPerMm).
  surface: PanelSurface;
  // Disable interactions (sheet open, immersive, offline).
  disabled?: boolean;
  // When true, the tray is always rendered open (editor preview).
  pinnedOpen?: boolean;
  // OS-reported computer name shown above the buttons. Empty string hides it.
  machineName?: string;
  // True when this panel is a remote/paired session (a phone reaching the PC),
  // not a local hardwired kiosk. The "Connected to <PC> 🔒" line shows only
  // then - a hardwired display already knows what it's plugged into.
  remotePaired?: boolean;
  // One-shot line above the buttons on the first-ever open (usePanelSwipeOnboarding).
  notice?: string;
}

export function PanelActionsTray({
  open,
  onOpen,
  onClose,
  onAddWidget,
  onSettings,
  onPair,
  pairAvailable,
  onPairSheet,
  pairSheetAvailable = false,
  surfaceRef,
  surface,
  disabled = false,
  pinnedOpen = false,
  machineName,
  remotePaired = false,
  notice,
}: PanelActionsTrayProps) {
  const { t } = useTranslation();
  const trayRef = useRef<HTMLDivElement | null>(null);

  const handleCommit = useCallback(() => {
    if (pinnedOpen) return;
    onOpen();
  }, [onOpen, pinnedOpen]);

  // Pin the open gesture to a real-world finger-travel distance: a fixed CSS-px
  // threshold is far shorter physically on the dense Y70 than on a phone.
  const pxPerMm = useMemo(() => cssPxPerMm(surface), [surface]);
  const swipe = usePanelTraySwipe({
    enabled: !disabled && !open && !pinnedOpen,
    surfaceRef,
    engageDistancePx: TRAY_ENGAGE_TRAVEL_MM * pxPerMm,
    commitDistancePx: TRAY_COMMIT_TRAVEL_MM * pxPerMm,
    commitVelocity: TRAY_COMMIT_FLICK_MM_PER_MS * pxPerMm,
    onCommit: handleCommit,
  });

  // Reset internal swipe state only on the transition into closed/disabled -
  // e.g. the tray dismissed externally or interactions disabled mid-gesture,
  // which tear down the hook's listeners without firing onEnd and leave
  // 'dragging' + a non-zero offset latched. Depend on the stable `reset`, NOT
  // the whole `swipe` object (new every render): the object form re-ran this
  // effect each render and, since `open` is false for the entire pre-commit
  // drag, reset the live offset on every touchmove - the tray would reveal,
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

  // The pairing button shows on two surfaces with different actions: inside the
  // native app wrapper it triggers the OS pairing dialog (onPair); everywhere
  // else it opens the in-panel pairing sheet (onPairSheet) - the host's
  // authorized-devices list on a local hardwired kiosk, or the phone's own
  // remembered-PCs list on a phone surface.
  const pairAction = isNativeApp()
    ? (pairAvailable && onPair ? onPair : undefined)
    : (pairSheetAvailable && onPairSheet ? onPairSheet : undefined);

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
        aria-label={t('panel.actions.label')}
      >
        {machineName && remotePaired && (
          <div className={styles.connectedTo}>
            <span className={styles.connectedLabel}>{t('panel.connectedTo')}</span>
            <span className={styles.connectedName}>{machineName}</span>
            <Lock size={12} className={styles.connectedLock} aria-label={t('panel.actions.e2eEncrypted')} />
          </div>
        )}
        {notice && (
          <div className={styles.notice} role="status" aria-live="polite">{notice}</div>
        )}
        <div className={styles.actionRow}>
        <Button
          size="lg"
          tone="neutral"
          icon={<Plus />}
          className={styles.trayButton}
          onClick={() => { onAddWidget(); onClose(); }}
        >
          {t('panel.actions.addWidget')}
        </Button>
        {onSettings && (
          <Button
            size="lg"
            tone="neutral"
            icon={<Settings2 />}
            className={styles.trayButton}
            onClick={() => { onSettings(); onClose(); }}
          >
            {t('panel.actions.settings')}
          </Button>
        )}
        {pairAction && (
          <HoverTooltip body={t('panel.actions.pairing')} side="top">
            <Button
              size="lg"
              tone="neutral"
              icon={<QrCode />}
              className={styles.trayButtonCompact}
              onClick={() => { pairAction(); onClose(); }}
              aria-label={t('panel.actions.pairing')}
            />
          </HoverTooltip>
        )}
        </div>
      </aside>
    </>
  );
}
