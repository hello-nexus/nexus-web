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
