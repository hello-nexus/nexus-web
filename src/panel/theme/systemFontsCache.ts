import { useEffect, useSyncExternalStore } from 'react';
import { fetchSystemFonts } from '../../api/systemFonts';

// Memory only, shared by every font dropdown in the page. The service holds the
// durable "loaded" flag for its process lifetime; a fresh page asks it once
// (peek) instead of persisting anything in the browser.
export type SystemFontsStatus = 'idle' | 'loading' | 'loaded' | 'empty';

export interface SystemFontsSnapshot {
  status: SystemFontsStatus;
  families: string[] | null;
}

let snapshot: SystemFontsSnapshot = { status: 'idle', families: null };
let peeked: Promise<void> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: SystemFontsSnapshot) {
  snapshot = next;
  listeners.forEach(l => l());
}

/** Asks the service, once per page, whether it already enumerated fonts. Never enumerates. */
export function peekSystemFonts(): Promise<void> {
  peeked ??= fetchSystemFonts({ peek: true }).then(res => {
    if (res.loaded && snapshot.status === 'idle') publish({ status: 'loaded', families: res.families });
  });
  return peeked;
}

/** Enumerates fonts on the service. One request is shared by every caller; a loaded list is reused. */
export function loadSystemFonts(): Promise<void> {
  if (snapshot.status === 'loaded') return Promise.resolve();
  if (loading) return loading;
  publish({ status: 'loading', families: null });
  loading = fetchSystemFonts().then(res => {
    // A failed enumeration (not loaded) returns to idle so the Load row stays and can retry;
    // empty is only a successful enumeration that found nothing.
    if (!res.loaded) publish({ status: 'idle', families: null });
    else publish(res.families.length > 0 ? { status: 'loaded', families: res.families } : { status: 'empty', families: null });
  }).finally(() => { loading = null; });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Cached families for a font dropdown; peeks once per page while `enabled`, never loads by itself. */
export function useSystemFonts(enabled: boolean): SystemFontsSnapshot {
  const snap = useSyncExternalStore(subscribe, () => snapshot);
  useEffect(() => {
    if (enabled) void peekSystemFonts();
  }, [enabled]);
  return snap;
}

export function resetSystemFontsCacheForTests() {
  snapshot = { status: 'idle', families: null };
  peeked = null;
  loading = null;
}
