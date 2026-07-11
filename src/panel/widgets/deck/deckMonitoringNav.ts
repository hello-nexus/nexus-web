// Cross-tree bridge for the monitoring tile's `press: 'monitoringPage'`: the
// executor (deckExecutor.ts) has no router access (it's a plain async
// function, not a component), so it dispatches a window event instead of
// calling useRoute().navigate directly. The desktop dashboard (the only
// surface with an in-app Monitoring page to navigate to) registers a
// listener; a panel/kiosk surface that never registers one makes
// requestOpenMonitoring a no-op, matching the contract ("no-op on panel
// surfaces without it") for free - dispatchEvent with zero listeners does
// nothing.
const NAV_EVENT = 'nexus-deck-open-monitoring';

export function onDeckOpenMonitoring(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(NAV_EVENT, listener);
  return () => window.removeEventListener(NAV_EVENT, listener);
}

export function requestOpenMonitoring(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NAV_EVENT));
}
