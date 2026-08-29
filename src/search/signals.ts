import { useEffect } from 'react';

// Search → UI bridge for controls the palette can't reach by navigation
// alone: an entry fires a named signal and the owning component acts on it.
// A signal fired before its owner mounts (the entry navigates first, then
// fires) is held pending and consumed when the owner subscribes, so
// cross-page opens work without coupling the palette to page internals.

export type SearchSignal =
  | 'update-modal'
  | 'about'
  | 'add-widget'
  | 'desktop-widgets'
  | 'devices-connected'
  | 'devices-supported'
  | 'conflict-apps';

type Handler = () => void;

const handlers = new Map<SearchSignal, Set<Handler>>();
// Pending fire-times. A pending signal is only consumed while fresh, so one
// that never finds its owner (wrong platform, user navigated away) doesn't
// pop a modal minutes later when the page is finally visited.
const pending = new Map<SearchSignal, number>();
const PENDING_TTL_MS = 8000;

export function fireSearchSignal(name: SearchSignal): void {
  const set = handlers.get(name);
  if (set && set.size > 0) {
    set.forEach((h) => h());
  } else {
    pending.set(name, Date.now());
  }
}

/** Subscribe the owning component. Pass a stable (useCallback) handler. */
export function useSearchSignal(name: SearchSignal, handler: Handler): void {
  useEffect(() => {
    let set = handlers.get(name);
    if (!set) {
      set = new Set();
      handlers.set(name, set);
    }
    set.add(handler);
    const firedAt = pending.get(name);
    if (firedAt !== undefined) {
      pending.delete(name);
      if (Date.now() - firedAt < PENDING_TTL_MS) handler();
    }
    return () => {
      set.delete(handler);
    };
  }, [name, handler]);
}

/** Test hook: drop any pending signals between cases. */
export function clearPendingSearchSignals(): void {
  pending.clear();
}
