import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

// The case fills about this share of the square image the portal draws.
const DRAWING_SHARE = 0.9;
const MIN_SIZE = 128;
const MAX_SIZE = 2048;
// A stored image is kept while its width is within this window around the wanted size; outside it, it is drawn again (a smaller
// one is soft, a much larger one loses the smooth downscale).
const STALE_BELOW = 0.75;
const STALE_ABOVE = 1.5;
/** A redraw happens at most this often per case in one context, and at most MAX_REDRAWS times in one launch: after that the image stays as it is, so contexts that want very different sizes, or a portal that ignores the size, cost a few renders and no more. */
export const REDRAW_INTERVAL_MS = 10 * 60 * 1000;
export const MAX_REDRAWS = 3;
// A new measurement within this share of the current size is noise (a scale transition settling), not a change.
const SETTLE_SHARE = 0.05;

/** How many pixels across the portal should draw the square case image so the drawing meets the screen pixel for pixel; null for a box that has no width. */
export function previewSizeFor(cssWidth: number, devicePixelRatio: number): number | null {
  if (!Number.isFinite(cssWidth) || cssWidth <= 0) return null;
  const px = Math.ceil((cssWidth * (devicePixelRatio > 0 ? devicePixelRatio : 1)) / DRAWING_SHARE);
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, px));
}

/** Whether a stored image of `actual` px across is outside the window around `wanted`. */
export function isStaleSize(actual: number, wanted: number): boolean {
  return actual < wanted * STALE_BELOW || actual > wanted * STALE_ABOVE;
}

export interface RedrawRecord {
  count: number;
  last: number;
}

/** Whether a stale image may be redrawn now: within the budget, and not within the interval after the last redraw. */
export function mayRedraw(record: RedrawRecord | undefined, now: number): boolean {
  return record === undefined || (record.count < MAX_REDRAWS && now - record.last >= REDRAW_INTERVAL_MS);
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
    localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    // Storage is unavailable; the size is remembered for this page only.
  }
}

// What the frames draw for. It outlives the tiles (the Build page replaces the dashboard, and its hello still has to carry the
// size) and the page itself (the last published size is kept in storage).
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

/** The size the frames draw the image at: the largest any live tile wants, else the last one (also across launches). Null until a tile has measured itself in this context. */
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
