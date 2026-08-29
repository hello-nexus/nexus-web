// Cross-tree bridge for jumping into the Frames app's game detail from
// another page (the Steam page's own FPS chip) - mirrors deckMonitoringNav's
// window-event bridge, since neither page has direct router access to the
// other. The desktop dashboard registers the listener; a surface that never
// registers one makes requestOpenFramesGame a no-op.
const NAV_EVENT = 'nexus-open-frames-game';

export function onOpenFramesGame(handler: (gameKey: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(NAV_EVENT, listener);
  return () => window.removeEventListener(NAV_EVENT, listener);
}

export function requestOpenFramesGame(gameKey: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: gameKey }));
}
