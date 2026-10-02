import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { usePanelSheetSwipe } from '../engine/usePanelSheetSwipe';
import { ImmersiveExitProvider } from './immersiveExit';
import { PanelImmersiveProvider } from '../widgets/common/PanelImmersiveContext';
import { useModalA11y } from '../../components/common/Overlay/useModalA11y';
import { useTranslation } from '../../lib/i18n';
import { PanelSwipeHint } from '../chrome/PanelSwipeHint';
import { SWIPE_HINT_PERIOD_MS, SWIPE_HINT_VISIBLE_MS } from '../engine/usePanelSwipeOnboarding';
import styles from './PanelImmersiveOverlay.module.scss';

interface PanelImmersiveOverlayProps {
  open: boolean;
  onExit: () => void;
  // Skip the slide-up enter. The panel's immersive-on-load open has no
  // dashboard moment to transition FROM - the enter keyframe starts at
  // translateY(100%)/opacity 0, which would show the dashboard underneath for
  // its whole duration.
  instant?: boolean;
  children: ReactNode;
  // Same theme + accent CSS vars as the panel root, so descendants (button
  // data-active, accent borders) resolve. The overlay is portaled outside the
  // panel root and would otherwise inherit none.
  themeStyle?: CSSProperties;
  themeMode?: 'dark' | 'light';
  surface?: string;
  // Opt-in per app (meta.immersiveDoubleSwipe): a first swipe or hint tap only
  // reveals the close hint, and only a second one before the hint fades again
  // closes. Default: any swipe closes.
  confirmClose?: boolean;
  // First-run swipe-down hand, shown until the host records a close.
  swipeHint?: boolean;
}

const EXIT_MS = 200;
// Idle delay before the drawer's close notch fades away.
export const NOTCH_FADE_DELAY_MS = 1500;
// The least time a confirmClose reveal keeps the next swipe or hint tap armed
// to close; it stays armed for as long as the hint keeps showing.
export const CONFIRM_WINDOW_MS = 3000;

export function PanelImmersiveOverlay({ open, onExit, children, themeStyle, themeMode, surface, instant = false, confirmClose = false, swipeHint = false }: PanelImmersiveOverlayProps) {
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
  // Escape) could never reach onExit.
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

  // The close notch starts visible, then fades out after an idle delay so it
  // stops competing with the content; a tap while faded reveals it again
  // instead of closing, and only a tap while it is already visible closes.
  const [notchVisible, setNotchVisible] = useState(true);
  const notchFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set by a confirmClose reveal swipe or hint tap and cleared when the notch
  // fades: the notch alone is no proof of intent, since it shows on open and
  // after any drag or pointer move.
  const closeArmed = useRef(false);

  const scheduleNotchFade = useCallback(() => {
    if (notchFadeTimer.current) clearTimeout(notchFadeTimer.current);
    notchFadeTimer.current = setTimeout(() => {
      notchFadeTimer.current = null;
      closeArmed.current = false;
      setNotchVisible(false);
    }, closeArmed.current ? CONFIRM_WINDOW_MS : NOTCH_FADE_DELAY_MS);
  }, []);

  // Refusing the dismiss (confirmClose reveal-only swipe) tells the hook to
  // snap the sheet back to rest instead of gliding it off-screen.
  const handleSwipeDismiss = useCallback((): boolean => {
    if (confirmClose && !closeArmed.current) {
      closeArmed.current = true;
      setNotchVisible(true);
      scheduleNotchFade();
      return false;
    }
    beginExit();
    return true;
  }, [confirmClose, beginExit, scheduleNotchFade]);

  // Swipe DOWN to dismiss, mirroring the editor sheet. Bottom-edge swipe-up is
  // the iOS home indicator, so never close from there.
  const swipe = usePanelSheetSwipe({
    enabled: mountState === 'mounted',
    sheetRef: overlayRef,
    onDismiss: handleSwipeDismiss,
  });

  // Reveals on open and re-arms the fade timer whenever a drag settles back
  // to idle (a dismissing drag unmounts before the timer would matter). A
  // drag in progress owns visibility instead - the timer must not fight it.
  useEffect(() => {
    if (mountState !== 'mounted') return;
    if (swipe.state === 'dragging') {
      if (notchFadeTimer.current) {
        clearTimeout(notchFadeTimer.current);
        notchFadeTimer.current = null;
      }
      setNotchVisible(true);
      return;
    }
    setNotchVisible(true);
    scheduleNotchFade();
    return () => {
      if (notchFadeTimer.current) {
        clearTimeout(notchFadeTimer.current);
        notchFadeTimer.current = null;
      }
    };
  }, [mountState, swipe.state, scheduleNotchFade]);

  const handleNotchTap = useCallback(() => {
    if (confirmClose ? closeArmed.current : notchVisible) {
      beginExit();
      return;
    }
    if (confirmClose) closeArmed.current = true;
    setNotchVisible(true);
    scheduleNotchFade();
  }, [confirmClose, notchVisible, beginExit, scheduleNotchFade]);

  // Touch reveals the hint by dragging, which a mouse cannot do - without this
  // a pointer-driven surface (the simulator) is left with no visible exit once
  // the hint fades.
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    setNotchVisible(true);
    scheduleNotchFade();
  }, [scheduleNotchFade]);

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
  // animation. Seeded true, the same attribute suppresses the enter itself.
  // Hooks must run before the conditional return below.
  const [didEnter, setDidEnter] = useState(instant);
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

  // Shows once the slide-in settles, then every period; a drag hides it.
  const [hintVisible, setHintVisible] = useState(false);
  const hintActive = swipeHint && mountState === 'mounted' && didEnter && swipe.state === 'idle';
  useEffect(() => {
    if (!hintActive) return;
    let hide: ReturnType<typeof window.setTimeout> | null = null;
    const show = () => {
      setHintVisible(true);
      hide = window.setTimeout(() => { hide = null; setHintVisible(false); }, SWIPE_HINT_VISIBLE_MS);
    };
    show();
    const period = window.setInterval(show, SWIPE_HINT_PERIOD_MS);
    return () => {
      window.clearInterval(period);
      if (hide) window.clearTimeout(hide);
      setHintVisible(false);
    };
  }, [hintActive]);

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
      onPointerMove={handlePointerMove}
    >
      <div className={styles.body}>
        <ImmersiveExitProvider value={beginExit}>
          <PanelImmersiveProvider value={true}>{children}</PanelImmersiveProvider>
        </ImmersiveExitProvider>
      </div>
      {/* A finger sliding in from above the screen lands here first, so the
          close swipe starts on this strip and the content never sees it. */}
      <div className={styles.edgeCatcher} data-panel-tap-surface="true" aria-hidden="true" />
      <button
        type="button"
        className={styles.exitHint}
        onClick={handleNotchTap}
        // A tap that engaged the drag raced onClick against the snap-back and
        // left the overlay stuck partway down on Y70 WebView2.
        data-panel-tap-surface="true"
        // Opacity-only: the hit area, role, and label stay constant while
        // faded so a tap always lands and assistive tech never loses it.
        data-revealed={notchVisible ? 'true' : 'false'}
        aria-label={t('panel.immersive.close')}
      />
      {hintVisible && <PanelSwipeHint direction="down" />}
    </div>
  );
}
