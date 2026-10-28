import { GESTURE_AXIS_DOMINANCE, GESTURE_ENGAGE_PX } from '../engine/gestureThresholds';
import type { WebViewRect } from './webViewProtocol';

type HitTest = (x: number, y: number) => Element | null;

// The hit points stay clear of rounded corners and edge antialiasing, which
// would otherwise fail the check on a tile that is plainly uncovered.
const MIN_INSET = 4;
const MAX_INSET = 24;
const INSET_FRACTION = 0.12;

// Edge midpoints sit this close to the true edge, where a slim bar or toast
// along a side would otherwise slip between the inset grid points.
const EDGE_INSET = 2;

/** A 3x3 grid on the inset rect plus the four edge midpoints. */
export function probePoints(rect: WebViewRect): Array<[number, number]> {
  const inset = Math.min(MAX_INSET, Math.max(MIN_INSET, Math.min(rect.w, rect.h) * INSET_FRACTION));
  const xs = [rect.x + inset, rect.x + rect.w / 2, rect.x + rect.w - inset];
  const ys = [rect.y + inset, rect.y + rect.h / 2, rect.y + rect.h - inset];
  const pts: Array<[number, number]> = [];
  for (const y of ys) for (const x of xs) pts.push([x, y]);
  const cx = xs[1];
  const cy = ys[1];
  pts.push(
    [cx, rect.y + EDGE_INSET],
    [cx, rect.y + rect.h - EDGE_INSET],
    [rect.x + EDGE_INSET, cy],
    [rect.x + rect.w - EDGE_INSET, cy],
  );
  return pts;
}

export interface ViewportSize {
  w: number;
  h: number;
}

/** True only when `el` is what the user sees at every probe point of the rect's on-screen part (the host clips the rest). */
export function isTopmost(el: Element, rect: WebViewRect, hit: HitTest, viewport: ViewportSize): boolean {
  const x0 = Math.max(rect.x, 0);
  const y0 = Math.max(rect.y, 0);
  const x1 = Math.min(rect.x + rect.w, viewport.w);
  const y1 = Math.min(rect.y + rect.h, viewport.h);
  if (x1 <= x0 || y1 <= y0) return false;
  return probePoints({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }).every(([x, y]) => {
    const found = hit(x, y);
    return found !== null && (found === el || el.contains(found));
  });
}

export interface VisibilityInput {
  supported: boolean;
  documentVisible: boolean;
  suppressed: boolean;
  connected: boolean;
  loadFailed: boolean;
  rect: WebViewRect;
  el: Element;
  hit: HitTest;
  viewport: ViewportSize;
}

export function computeVisible(i: VisibilityInput): boolean {
  if (!i.supported || !i.documentVisible || i.suppressed || !i.connected || i.loadFailed) return false;
  return isTopmost(i.el, i.rect, i.hit, i.viewport);
}

export interface WebViewSuppressors {
  sheet: boolean;
  tray: boolean;
  controlCenter: boolean;
  contextMenu: boolean;
  rearranging: boolean;
  dragging: boolean;
  /** Corner-drag resize mode: the frame and its hit areas must not sit under a native window. */
  resizing: boolean;
}

/** Any state that moves or covers tiles hides every native web view. */
export function webViewSuppressedBy(state: WebViewSuppressors): boolean {
  return Object.values(state).some(Boolean);
}

/**
 * True once a drag has become a vertical pull of the panel: past the engage
 * distance of the nearest sheet and the axis dominance the tray and control center use. A tap
 * with finger drift, or a horizontal page swipe, stays false.
 */
export function dragHidesTiles(dx: number, dy: number, engagePx: number = GESTURE_ENGAGE_PX): boolean {
  return Math.abs(dy) > engagePx && Math.abs(dy) > Math.abs(dx) * GESTURE_AXIS_DOMINANCE;
}
