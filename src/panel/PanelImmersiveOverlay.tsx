import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePanelSheetSwipe } from './engine/usePanelSheetSwipe';
import styles from './PanelImmersiveOverlay.module.scss';

interface PanelImmersiveOverlayProps {
  open: boolean;
  onExit: () => void;
  children: ReactNode;
  // Pass the same theme + accent CSS variables the panel root has so
  // descendants (button data-active states, accent borders, etc.)
  // resolve correctly. The overlay is portaled outside the panel root
  // and would otherwise inherit none of them.
  themeStyle?: CSSProperties;
  themeMode?: 'dark' | 'light';
  surface?: string;
}

const EXIT_MS = 200;

export function PanelImmersiveOverlay({ open, onExit, children, themeStyle, themeMode, surface }: PanelImmersiveOverlayProps) {
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

  useEffect(() => {
    if (open && mountState !== 'mounted') {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      // Mount transition is driven by the external `open` prop crossing into
      // true; nothing else in render can synchronously derive 'mounted' from
      // 'unmounted' / 'exiting' without losing the cancel-pending-exit step.
       
      setMountState('mounted');
    } else if (!open && mountState === 'mounted') {
      beginExit();
    }
  }, [open, mountState, beginExit]);

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  // Swipe DOWN to dismiss, mirroring the editor sheet (catalog /
  // settings) gesture. Bottom-edge swipe-up is reserved on iOS for the
  // home indicator, so we never trigger close from there.
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
    // Capture phase so we win over any other ESC handler (e.g. the
    // editor sheet's). Without capture, the order depends on
    // registration timing and the immersive overlay can't always
    // claim the key reliably.
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [mountState, beginExit]);

  // Mirror the editor sheet's [data-entered] pattern: once the entry has
  // played (or as soon as a swipe gesture starts), suppress the keyframe
  // so removing [data-drag] at the end of a snap-back doesn't replay the
  // enter animation. Hooks must run before the conditional return below.
  const [didEnter, setDidEnter] = useState(false);
  useEffect(() => {
    // Track whether the user has started a swipe so the [data-entered]
    // attribute toggle suppresses the keyframe replay on snap-back. Latching
    // didEnter to true is the canonical "external-event → flag" effect.
     
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

  // Merge theme tokens onto the overlay root so descendants resolve
  // accent + text colours that would otherwise be missing because the
  // overlay is portaled outside .panelRoot.
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
        // Marks this element so usePanelSheetSwipe.isSheetSwipeControlTarget
        // skips arming the drag when the touch lands here. Without this the
        // swipe handler engages on tap, then onClick races the snap-back and
        // the overlay can get stuck partway down on Y70 WebView2.
        data-panel-no-sheet-swipe="true"
        aria-label="Close immersive view"
      />
    </div>
  );
}
