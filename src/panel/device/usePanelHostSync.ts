import { useEffect, useRef, type RefObject } from 'react';
import { collectHitRects, hitTestMessage, onHostRequestHitTest, postPanelHostMessage } from './panelHostBridge';

const HIT_SELECTOR = '[data-panel-widget-id], [data-panel-hit]';

export const LEASE_RENEW_MS = 2000;

/**
 * Reports which parts of a see-through window take input. Click-through reports the widget rects;
 * click-through off reports a steady full. `transientFull` (a sheet, drag or immersive view) reports
 * a leased full renewed every LEASE_RENEW_MS. `signature` changes when layout may have moved.
 */
export function usePanelHitTest(active: boolean, clickThrough: boolean, transientFull: boolean, rootRef: RefObject<HTMLElement | null>, signature: string): void {
  const lastRef = useRef('');
  useEffect(() => {
    if (!active) {
      lastRef.current = '';
      return undefined;
    }
    let frame = 0;
    const send = (force = false) => {
      frame = 0;
      const full = transientFull || !clickThrough;
      const rects = full
        ? []
        : collectHitRects(document.querySelectorAll(HIT_SELECTOR), { width: window.innerWidth, height: window.innerHeight });
      const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const msg = hitTestMessage(full, rects, dpr, transientFull);
      const key = JSON.stringify(msg);
      if (!force && key === lastRef.current) return;
      lastRef.current = key;
      postPanelHostMessage(msg);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => send());
    };
    schedule();
    const renew = transientFull ? window.setInterval(() => send(true), LEASE_RENEW_MS) : 0;
    const offRequest = onHostRequestHitTest(() => {
      lastRef.current = '';
      if (frame) cancelAnimationFrame(frame);
      send();
    });
    const root = rootRef.current;
    const observer = root && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (root && observer) observer.observe(root);
    // Boxes settle only when their transitions and keyframes end.
    document.addEventListener('transitionend', schedule, true);
    document.addEventListener('animationend', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (renew) window.clearInterval(renew);
      offRequest();
      observer?.disconnect();
      document.removeEventListener('transitionend', schedule, true);
      document.removeEventListener('animationend', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [active, clickThrough, transientFull, rootRef, signature]);
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
