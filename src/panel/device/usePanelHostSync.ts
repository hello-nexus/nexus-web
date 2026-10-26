import { useEffect, useRef, type RefObject } from 'react';
import { collectHitRects, frostMessage, hitTestMessage, onHostRequestHitTest, postPanelHostMessage } from './panelHostBridge';

const HIT_SELECTOR = '[data-panel-widget-id], [data-panel-hit]';

export const LEASE_RENEW_MS = 2000;

/**
 * Reports which parts of a see-through window take input. Click-through reports the widget rects;
 * click-through off reports a steady full. `transientFull` (a sheet, drag or immersive view) reports
 * a leased full renewed every LEASE_RENEW_MS. `signature` changes when layout may have moved.
 */
export function usePanelHitTest(active: boolean, clickThrough: boolean, transientFull: boolean, rootRef: RefObject<HTMLElement | null>, signature: string): void {
  const lastRef = useRef('');
  // Posts the report for the current state; `lease` false is the steady one.
  const reportRef = useRef<((lease: boolean, force: boolean) => void) | null>(null);
  useEffect(() => {
    if (!active) {
      lastRef.current = '';
      reportRef.current = null;
      return undefined;
    }
    let frame = 0;
    const report = (lease: boolean, force: boolean) => {
      frame = 0;
      const full = lease || !clickThrough;
      const rects = full
        ? []
        : collectHitRects(document.querySelectorAll(HIT_SELECTOR), { width: window.innerWidth, height: window.innerHeight });
      const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const msg = hitTestMessage(full, rects, dpr, lease);
      const key = JSON.stringify(msg);
      if (!force && key === lastRef.current) return;
      lastRef.current = key;
      postPanelHostMessage(msg);
    };
    reportRef.current = report;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => report(transientFull, false));
    };
    schedule();
    const offRequest = onHostRequestHitTest(() => {
      lastRef.current = '';
      if (frame) cancelAnimationFrame(frame);
      report(transientFull, false);
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
      offRequest();
      observer?.disconnect();
      document.removeEventListener('transitionend', schedule, true);
      document.removeEventListener('animationend', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [active, clickThrough, transientFull, rootRef, signature]);

  // The renewal keeps its own cadence: a signature change must not restart the clock.
  useEffect(() => {
    if (!active || !transientFull) return undefined;
    const timer = window.setInterval(() => reportRef.current?.(true, true), LEASE_RENEW_MS);
    return () => window.clearInterval(timer);
  }, [active, transientFull]);

  // Unmounting hands the host the steady report so a lease does not outlive the page.
  useEffect(() => () => {
    if (reportRef.current) reportRef.current(false, true);
  }, []);
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
  useEffect(() => () => {
    if (lastRef.current !== null) postPanelHostMessage({ type: 'nexus.panel.raise', value: false });
  }, []);
}

/** Lets the host activate the kiosk so a text field can take the keyboard; released on close and on unmount. */
export function usePanelActivatable(active: boolean, wanted: boolean): void {
  const lastRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!active) {
      lastRef.current = null;
      return undefined;
    }
    if (lastRef.current !== wanted) {
      lastRef.current = wanted;
      postPanelHostMessage({ type: 'nexus.panel.activatable', value: wanted });
    }
    return onHostRequestHitTest(() => postPanelHostMessage({ type: 'nexus.panel.activatable', value: wanted }));
  }, [active, wanted]);
  useEffect(() => () => {
    if (lastRef.current === true) postPanelHostMessage({ type: 'nexus.panel.activatable', value: false });
  }, []);
}

// Catalog previews are not on the desktop; the drag overlay holds the card being moved.
const CARD_SELECTOR = '[data-panel-widget-id]:not([data-panel-catalog]) .panel-card, [data-panel-drag-overlay] .panel-card';

function cardRadius(): number {
  const card = document.querySelector(CARD_SELECTOR);
  if (!card) return 0;
  const radius = Number.parseFloat(getComputedStyle(card).borderTopLeftRadius);
  return Number.isFinite(radius) ? radius : 0;
}

/**
 * Reports the card areas for the host's native blur on a see-through panel, and `none` otherwise.
 * `dragging` re-measures every frame so the blur follows the card being moved; `signature` changes when layout may have moved.
 */
export function usePanelFrost(active: boolean, percent: number, seeThrough: boolean, dragging: boolean, rootRef: RefObject<HTMLElement | null>, signature: string): void {
  const lastRef = useRef('');
  const release = () => {
    if (lastRef.current === '') return;
    const msg = frostMessage(0, false, [], 1, 0);
    if (JSON.stringify(msg) !== lastRef.current) postPanelHostMessage(msg);
    lastRef.current = '';
  };
  const releaseRef = useRef(release);
  releaseRef.current = release;
  useEffect(() => {
    if (!active) {
      releaseRef.current();
      return undefined;
    }
    let frame = 0;
    const send = (force = false) => {
      const frosted = seeThrough && percent > 0;
      const rects = frosted
        ? collectHitRects(document.querySelectorAll(CARD_SELECTOR), { width: window.innerWidth, height: window.innerHeight })
        : [];
      const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const msg = frostMessage(percent, seeThrough, rects, dpr, frosted ? cardRadius() : 0);
      const key = JSON.stringify(msg);
      if (!force && key === lastRef.current) return;
      lastRef.current = key;
      postPanelHostMessage(msg);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; send(); });
    };
    const follow = () => {
      send();
      frame = requestAnimationFrame(follow);
    };
    // Paging swipes animate through transitions: follow every frame while one runs.
    let running = 0;
    const onRun = () => {
      running += 1;
      if (!frame) frame = requestAnimationFrame(follow);
    };
    const onEnd = () => {
      running = Math.max(0, running - 1);
      if (running === 0 && !dragging) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      }
      schedule();
    };
    if (dragging) frame = requestAnimationFrame(follow);
    else schedule();
    const offRequest = onHostRequestHitTest(() => { lastRef.current = ''; send(); });
    const root = rootRef.current;
    const observer = root && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (root && observer) observer.observe(root);
    document.addEventListener('transitionrun', onRun, true);
    document.addEventListener('transitionend', onEnd, true);
    document.addEventListener('transitioncancel', onEnd, true);
    document.addEventListener('animationend', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      offRequest();
      observer?.disconnect();
      document.removeEventListener('transitionrun', onRun, true);
      document.removeEventListener('transitionend', onEnd, true);
      document.removeEventListener('transitioncancel', onEnd, true);
      document.removeEventListener('animationend', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [active, percent, seeThrough, dragging, rootRef, signature]);
  useEffect(() => () => releaseRef.current(), []);
}
