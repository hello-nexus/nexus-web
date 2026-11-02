import { useSyncExternalStore } from 'react';

// The case fills about this share of the square image the portal draws.
const DRAWING_SHARE = 0.9;
const MIN_SIZE = 128;
const MAX_SIZE = 2048;
// A stored image smaller than this share of the wanted size is soft, larger than the upper one is shrunk soft by the browser.
const STALE_BELOW = 0.9;
const STALE_ABOVE = 1.25;
// A new measurement within this share of the current size is noise (a scale transition settling), not a change.
const SETTLE_SHARE = 0.05;

/** How many pixels across the portal should draw the square case image so the drawing meets the screen pixel for pixel; null for a box that has no width. */
export function previewSizeFor(cssWidth: number, devicePixelRatio: number): number | null {
  if (!Number.isFinite(cssWidth) || cssWidth <= 0) return null;
  const px = Math.ceil((cssWidth * (devicePixelRatio > 0 ? devicePixelRatio : 1)) / DRAWING_SHARE);
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, px));
}

/** Whether a stored image of `actual` px across is too far from `wanted` to show, so a new one should be drawn. */
export function isStaleSize(actual: number, wanted: number): boolean {
  return actual < wanted * STALE_BELOW || actual > wanted * STALE_ABOVE;
}

let current: number | null = null;
const listeners = new Set<() => void>();

/** The size the dashboard tile wants, shared with the Build frames that draw the image. Null until a tile has measured itself. */
export function getPreviewSize(): number | null {
  return current;
}

/** Records the size a tile wants; a change inside the settle band is ignored so the frame is not asked again for noise. */
export function setPreviewSize(next: number | null): void {
  if (next === null || next === current) return;
  if (current !== null && Math.abs(next - current) / current < SETTLE_SHARE) return;
  current = next;
  listeners.forEach((l) => l());
}

export function usePreviewSize(): number | null {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getPreviewSize);
}

/** Test seam. */
export function resetPreviewSize(): void {
  current = null;
  listeners.forEach((l) => l());
}
