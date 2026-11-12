const EVENT = 'nexus:pair-phone';

/** Asks the dashboard shell to open the Pair remote dialog, for views that sit outside it. */
export function requestPairPhone(): void {
  window.dispatchEvent(new Event(EVENT));
}

/** Subscribes the shell to requests from `requestPairPhone`; returns the unsubscribe. */
export function onPairPhoneRequest(handler: () => void): () => void {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
