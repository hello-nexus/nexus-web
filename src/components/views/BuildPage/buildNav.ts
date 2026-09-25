import { useSyncExternalStore } from 'react';

// Cross-tree bridge for deep-linking into the Build app from Benchmark or
// Frames, mirroring framesNav.ts - neither page has direct router access to
// Dashboard, which owns the route. A surface that never registers a listener
// makes requestOpenBuild a no-op.
const NAV_EVENT = 'nexus-open-build';

/** `handler` receives the URL-encoded route segment requestOpenBuild sent. */
export function onOpenBuild(handler: (path: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(NAV_EVENT, listener);
  return () => window.removeEventListener(NAV_EVENT, listener);
}

// Encoded into one route segment here (Dashboard hands it straight to
// navigate()'s subtab), so a slash or query character in `path` can never
// split across route segments or leak into the app's own query string.
// BuildPage decodes and re-validates it before use (see sanitizeBuildPath).
export function requestOpenBuild(path: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: encodeURIComponent(path) }));
}

export interface BuildFrameHistory {
  canGoBack: boolean;
  canGoForward: boolean;
}

const NO_FRAME_HISTORY: BuildFrameHistory = { canGoBack: false, canGoForward: false };
let frameHistory = NO_FRAME_HISTORY;
const frameHistoryListeners = new Set<() => void>();

// The Build frame's own back/forward reach (nexus-build:history), for the top bar's arrows.
export function setBuildFrameHistory(next: BuildFrameHistory): void {
  if (next.canGoBack === frameHistory.canGoBack && next.canGoForward === frameHistory.canGoForward) return;
  frameHistory = next;
  frameHistoryListeners.forEach(listener => listener());
}

export function clearBuildFrameHistory(): void {
  setBuildFrameHistory(NO_FRAME_HISTORY);
}

function subscribeFrameHistory(listener: () => void): () => void {
  frameHistoryListeners.add(listener);
  return () => frameHistoryListeners.delete(listener);
}

export function useBuildFrameHistory(): BuildFrameHistory {
  return useSyncExternalStore(subscribeFrameHistory, () => frameHistory, () => NO_FRAME_HISTORY);
}
