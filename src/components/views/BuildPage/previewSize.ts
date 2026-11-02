import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

// The case fills about this share of the square image the portal draws.
const DRAWING_SHARE = 0.9;
const MIN_SIZE = 128;
const MAX_SIZE = 2048;
// A stored image narrower than this share of the wanted size is soft. A larger one is only scaled down, so it is always kept:
// sizes only grow, which is what settles two contexts that want different sizes.
const STALE_BELOW = 0.9;
// The width the portal draws at when it was not told a size (with the heavier default lines); such an image is replaced when a smaller one is wanted.
const UNSIZED_WIDTH = 1024;
/** A too-small stored image is redrawn at most this often per case and size, per context, so a save from another context is corrected later and never in a loop. */
export const REDRAW_INTERVAL_MS = 10 * 60 * 1000;
// A new measurement within this share of the current size is noise (a scale transition settling), not a change.
const SETTLE_SHARE = 0.05;

/** How many pixels across the portal should draw the square case image so the drawing meets the screen pixel for pixel; null for a box that has no width. */
export function previewSizeFor(cssWidth: number, devicePixelRatio: number): number | null {
  if (!Number.isFinite(cssWidth) || cssWidth <= 0) return null;
  const px = Math.ceil((cssWidth * (devicePixelRatio > 0 ? devicePixelRatio : 1)) / DRAWING_SHARE);
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, px));
}

/** Whether a stored image of `actual` px across is too small for `wanted`, or is the unsized default drawn where a smaller image is wanted. */
export function isStaleSize(actual: number, wanted: number): boolean {
  return actual < wanted * STALE_BELOW || (actual === UNSIZED_WIDTH && wanted < UNSIZED_WIDTH * STALE_BELOW);
}

/** Whether a stale image may be redrawn now: not within the interval after this context's last attempt for the same case and size. */
export function mayRedraw(lastAttemptAt: number | undefined, now: number): boolean {
  return lastAttemptAt === undefined || now - lastAttemptAt >= REDRAW_INTERVAL_MS;
}

// Each live tile reports what it wants; the frames draw for the largest, so a smaller tile shows a larger image scaled
// down (smooth) and two tiles of different sizes never take turns overwriting each other.
const sources = new Map<object | string, number>();
const STORAGE_KEY = 'nexus.build.previewSize';

function readStored(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(value) && value >= MIN_SIZE && value <= MAX_SIZE ? value : null;
  } catch {
    return null;
  }
}

function writeStored(size: number): void {
  try {
    if ((readStored() ?? 0) < size) localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    // Storage is unavailable; the size is remembered for this page only.
  }
}

// What the frames draw for. It outlives the tiles (the Build page replaces the dashboard, and its hello still has to carry the
// size) and the page itself (the largest size seen in this context is kept in storage).
let current: number | null = readStored();
const listeners = new Set<() => void>();

function publish(): void {
  // With no tile alive the last size stands.
  if (sources.size === 0) return;
  const largest = Math.max(...sources.values());
  if (largest === current) return;
  if (current !== null && Math.abs(largest - current) / current < SETTLE_SHARE) return;
  current = largest;
  writeStored(largest);
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

/** A tile's way to report its size while `active`: its entry leaves the shared set when the tile stops reporting or unmounts. */
export function usePreviewSizeReporter(active: boolean): (size: number | null) => void {
  const id = useRef<object>({});
  useEffect(() => {
    if (!active) return undefined;
    const own = id.current;
    return () => unregisterPreviewSize(own);
  }, [active]);
  return useCallback((size: number | null) => registerPreviewSize(id.current, size), []);
}

/** The size the frames draw the image at: the largest any live tile wants, else the last one. Null until a tile has measured itself in this context. */
export function getPreviewSize(): number | null {
  return current;
}

export function usePreviewSize(): number | null {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getPreviewSize);
}

/** Test seam: forgets every size, in memory and in storage. */
export function resetPreviewSize(): void {
  sources.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
  current = null;
  listeners.forEach((l) => l());
}
