import { useEffect, useRef, type RefObject } from 'react';
import { collectHitRects, hitTestMessage, onHostRequestHitTest, postPanelHostMessage } from './panelHostBridge';

const HIT_SELECTOR = '[data-panel-widget-id], [data-panel-hit]';

/**
 * Tells the kiosk host which parts of the window take input while the panel is
 * see-through and click-through. `full` hands it the whole window; otherwise only
 * the widget cards and chrome count. `signature` changes whenever layout may have moved.
 */
export function usePanelHitTest(active: boolean, full: boolean, rootRef: RefObject<HTMLElement | null>, signature: string): void {
  const lastRef = useRef('');
  useEffect(() => {
    if (!active) {
      lastRef.current = '';
      return undefined;
    }
    let frame = 0;
    const send = () => {
      frame = 0;
      const rects = full
        ? []
        : collectHitRects(document.querySelectorAll(HIT_SELECTOR), { width: window.innerWidth, height: window.innerHeight });
      const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const msg = hitTestMessage(full, rects, dpr);
      const key = JSON.stringify(msg);
      if (key === lastRef.current) return;
      lastRef.current = key;
      postPanelHostMessage(msg);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(send);
    };
    schedule();
    // A host that reset its region asks for the current state again.
    const offRequest = onHostRequestHitTest(() => {
      lastRef.current = '';
      if (frame) cancelAnimationFrame(frame);
      send();
    });
    const root = rootRef.current;
    const observer = root && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (root && observer) observer.observe(root);
    // Cells and menus move through CSS transitions and keyframes; their final box is what counts.
    document.addEventListener('transitionend', schedule, true);
    document.addEventListener('animationend', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      offRequest();
      observer?.disconnect();
      document.removeEventListener('transitionend', schedule, true);
      document.removeEventListener('animationend', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [active, full, rootRef, signature]);
}

/** Lifts a not-on-top window above others while a menu, sheet or drag is open. */
export function usePanelRaise(active: boolean, raised: boolean): void {
  const lastRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!active) {
      lastRef.current = null;
      return undefined;
    }
    if (lastRef.current !== raised) {
      lastRef.current = raised;
      postPanelHostMessage({ type: 'nexus.panel.raise', value: raised });
    }
    return onHostRequestHitTest(() => postPanelHostMessage({ type: 'nexus.panel.raise', value: raised }));
  }, [active, raised]);
}
