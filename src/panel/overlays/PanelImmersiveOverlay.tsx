import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePanelSheetSwipe } from '../engine/usePanelSheetSwipe';
import { useModalA11y } from '../../components/common/Overlay/useModalA11y';
import { useTranslation } from '../../lib/i18n';
import styles from './PanelImmersiveOverlay.module.scss';

interface PanelImmersiveOverlayProps {
  open: boolean;
  onExit: () => void;
  children: ReactNode;
  // Same theme + accent CSS vars as the panel root, so descendants (button
  // data-active, accent borders) resolve. The overlay is portaled outside the
  // panel root and would otherwise inherit none.
  themeStyle?: CSSProperties;
  themeMode?: 'dark' | 'light';
  surface?: string;
  // The simulator drives the panel with a mouse on a scaled iframe canvas,
  // where the swipe-down dismiss is not reachable; render an explicit close
  // affordance there. On device the swipe (and its top-centre hint) is the
  // exit, so this stays off.
  showCloseButton?: boolean;
}

const EXIT_MS = 200;

export function PanelImmersiveOverlay({ open, onExit, children, themeStyle, themeMode, surface, showCloseButton = false }: PanelImmersiveOverlayProps) {
  const { t } = useTranslation();
  const [mountState, setMountState] = useState<'mounted' | 'exiting' | 'unmounted'>(
    open ? 'mounted' : 'unmounted',
  );
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const beginExit = useCallback(() => {
    if (mountState === 'exiting') return;
    setMountState('exiting');
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      setMountState('unmounted');
      onExit();
    }, EXIT_MS);
  }, [mountState, onExit]);

  // The host renders this with a literal `open`, so `open` is true for the
  // overlay's whole life and only the CROSSING into true may cancel a pending
  // exit. Reacting to the level instead reverts 'exiting' to 'mounted' on the
  // very next commit and clears the timer, so beginExit (hint tap, swipe,
  // Escape, close button) could never reach onExit.
  const prevOpen = useRef(open);
  useEffect(() => {
    const openedNow = open && !prevOpen.current;
    prevOpen.current = open;
    if (open && mountState !== 'mounted' && openedNow) {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      // Mount transition is driven by `open` crossing into true; render can't
      // derive 'mounted' from 'unmounted' / 'exiting' without losing the
      // cancel-pending-exit step.

      setMountState('mounted');
    } else if (!open && mountState === 'mounted') {
      beginExit();
    }
  }, [open, mountState, beginExit]);

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  // Swipe DOWN to dismiss, mirroring the editor sheet. Bottom-edge swipe-up is
  // the iOS home indicator, so never close from there.
  const swipe = usePanelSheetSwipe({
    enabled: mountState === 'mounted',
    sheetRef: overlayRef,
    onDismiss: beginExit,
  });

  // Registers with the shared modal stack so Escape and Tab are arbitrated
  // against whatever is topmost (e.g. the widget editor sheet) instead of
  // each surface racing its own listener. Background scroll-lock and focus
  // restore are left off: this overlay's own exit animation and swipe
  // gesture own that transition.
  useModalA11y({
    open: mountState === 'mounted',
    onClose: beginExit,
    containerRef: overlayRef,
    lockBackground: false,
    restoreFocus: false,
  });

  // [data-entered] pattern: once the entry plays (or a swipe starts), suppress
  // the keyframe so removing [data-drag] on snap-back doesn't replay the enter
  // animation. Hooks must run before the conditional return below.
  const [didEnter, setDidEnter] = useState(false);
  useEffect(() => {
    // Latch didEnter when a swipe starts so [data-entered] suppresses the
    // keyframe replay on snap-back.
     
    if (swipe.state !== 'idle') setDidEnter(true);
  }, [swipe.state]);
  useEffect(() => {
    if (mountState !== 'mounted') return;
    const t = window.setTimeout(() => setDidEnter(true), 280);
    return () => window.clearTimeout(t);
  }, [mountState]);

  if (mountState === 'unmounted') return null;

  const dragTransform = swipe.state === 'idle' && swipe.offset === 0
    ? undefined
    : ({ transform: `translateY(${swipe.offset}px)` } as CSSProperties);

  // Merge theme tokens onto the overlay root so descendants resolve accent +
  // text colours (the overlay is portaled outside .panelRoot).
  const composedStyle: CSSProperties = { ...(themeStyle ?? {}), ...(dragTransform ?? {}) };

  return (
    <div
      ref={overlayRef}
      className={`panel-root ${styles.overlay}`}
      data-state={mountState === 'exiting' ? 'exiting' : 'open'}
      data-drag={swipe.state === 'idle' ? undefined : swipe.state}
      data-entered={didEnter ? 'true' : undefined}
      data-theme={themeMode}
      data-surface={surface}
      style={composedStyle}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.body}>{children}</div>
      <button
        type="button"
        className={styles.exitHint}
        onClick={beginExit}
        // Marks this so usePanelSheetSwipe.isSheetSwipeControlTarget skips
        // arming the drag on a touch here. Else the swipe engages on tap,
        // onClick races the snap-back, and the overlay sticks partway down
        // on Y70 WebView2.
        data-panel-no-sheet-swipe="true"
        aria-label={t('panel.immersive.close')}
      />
      {showCloseButton && (
        <button
          type="button"
          className={styles.closeButton}
          onClick={beginExit}
          data-panel-no-sheet-swipe="true"
          aria-label={t('panel.immersive.close')}
        >
          <X aria-hidden />
        </button>
      )}
    </div>
  );
}
