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

/**
 * True only when `el` is what the user would see at every probe point: a menu,
 * sheet, toast or control center above it makes the hit land elsewhere, which
 * hides the native view without enumerating those layers.
 */
export function isTopmost(el: Element, rect: WebViewRect, hit: HitTest): boolean {
  if (rect.w <= 0 || rect.h <= 0) return false;
  return probePoints(rect).every(([x, y]) => {
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
}

export function computeVisible(i: VisibilityInput): boolean {
  if (!i.supported || !i.documentVisible || i.suppressed || !i.connected || i.loadFailed) return false;
  return isTopmost(i.el, i.rect, i.hit);
}
