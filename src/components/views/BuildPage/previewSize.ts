import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

// The case fills about this share of the square image the portal draws.
const DRAWING_SHARE = 0.9;
const MIN_SIZE = 128;
const MAX_SIZE = 2048;
// A stored image smaller than this share of the wanted size is soft. One larger is only scaled down, which stays smooth up to
// this factor, so a context that wants less never forces a redraw of what a context that wants more stored (no ping-pong).
const STALE_BELOW = 0.9;
const STALE_ABOVE = 2;
// A new measurement within this share of the current size is noise (a scale transition settling), not a change.
const SETTLE_SHARE = 0.05;

/** How many pixels across the portal should draw the square case image so the drawing meets the screen pixel for pixel; null for a box that has no width. */
export function previewSizeFor(cssWidth: number, devicePixelRatio: number): number | null {
  if (!Number.isFinite(cssWidth) || cssWidth <= 0) return null;
  const px = Math.ceil((cssWidth * (devicePixelRatio > 0 ? devicePixelRatio : 1)) / DRAWING_SHARE);
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, px));
}

/** Whether a stored image of `actual` px across is too small, or so much too large that a smooth downscale is lost, for `wanted`. */
export function isStaleSize(actual: number, wanted: number): boolean {
  return actual < wanted * STALE_BELOW || actual > wanted * STALE_ABOVE;
}

// Each live tile reports what it wants; the frames draw for the largest, so a smaller tile shows a larger image scaled
// down (smooth) and two tiles of different sizes never take turns overwriting each other.
const sources = new Map<object | string, number>();
let current: number | null = null;
const listeners = new Set<() => void>();

function publish(): void {
  const largest = sources.size > 0 ? Math.max(...sources.values()) : null;
  if (largest === current) return;
  if (largest !== null && current !== null && Math.abs(largest - current) / current < SETTLE_SHARE) return;
  current = largest;
  listeners.forEach((l) => l());
}

/** Records what one tile wants; a change inside the settle band of the published size is ignored so the frame is not asked again for noise. */
export function registerPreviewSize(id: object | string, size: number | null): void {
  if (size === null) return;
  sources.set(id, size);
  publish();
}

export function unregisterPreviewSize(id: object | string): void {
  sources.delete(id);
  publish();
}

/** A tile's way to report its size: its entry leaves the shared set when the tile unmounts. */
export function usePreviewSizeReporter(): (size: number | null) => void {
  const id = useRef<object>({});
  useEffect(() => {
    const own = id.current;
    return () => unregisterPreviewSize(own);
  }, []);
  return useCallback((size: number | null) => registerPreviewSize(id.current, size), []);
}

/** The size the frames draw the image at: the largest any live tile wants. Null until a tile has measured itself. */
export function getPreviewSize(): number | null {
  return current;
}

export function usePreviewSize(): number | null {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getPreviewSize);
}

/** Test seam. */
export function resetPreviewSize(): void {
  sources.clear();
  current = null;
  listeners.forEach((l) => l());
}
