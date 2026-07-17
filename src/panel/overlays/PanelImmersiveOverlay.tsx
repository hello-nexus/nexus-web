import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { usePanelSheetSwipe } from '../engine/usePanelSheetSwipe';
import { useTranslation } from '../../lib/i18n';
import { PanelImmersiveProvider } from '../widgets/common/PanelImmersiveContext';
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
}

const EXIT_MS = 200;

export function PanelImmersiveOverlay({ open, onExit, children, themeStyle, themeMode, surface }: PanelImmersiveOverlayProps) {
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

  // Tracks the previous `open` so the cancel-pending-exit branch runs only
  // when `open` CROSSES into true. Keying on the current value re-mounts on
  // every render while the host holds `open` true (PanelApp always does),
  // which cancelled every user-initiated exit - pill tap, swipe-dismiss, and
  // ESC all flipped to 'exiting' and were immediately pulled back.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !wasOpen && mountState !== 'mounted') {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
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

  useEffect(() => {
    if (mountState !== 'mounted') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        beginExit();
      }
    };
    // Capture phase to win over other ESC handlers (e.g. the editor sheet's);
    // without it, order depends on registration timing.
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [mountState, beginExit]);

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
      <div className={styles.body}>
        <PanelImmersiveProvider value={true}>{children}</PanelImmersiveProvider>
      </div>
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
      {/* Corner X: the explicit exit for content that owns its own gestures
          (the avatar claims drags away from swipe-dismiss), and the
          discoverable one everywhere else. */}
      <button
        type="button"
        className={styles.exitClose}
        onClick={beginExit}
        data-panel-no-sheet-swipe="true"
        aria-label={t('panel.immersive.close')}
      >
        <X aria-hidden />
      </button>
    </div>
  );
}
