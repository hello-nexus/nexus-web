// Cross-tree bridge for deep-linking into the Build app from Benchmark or
// Frames, mirroring framesNav.ts - neither page has direct router access to
// Dashboard, which owns the route. A surface that never registers a listener
// makes requestOpenBuild a no-op.
const NAV_EVENT = 'nexus-open-build';

export function onOpenBuild(handler: (path: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(NAV_EVENT, listener);
  return () => window.removeEventListener(NAV_EVENT, listener);
}

export function requestOpenBuild(path: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: path }));
}
