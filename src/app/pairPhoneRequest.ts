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

const CLOSED_EVENT = 'nexus:pair-phone-closed';

/** Tells views outside the shell that the Pair remote dialog closed, so they can re-read paired-phone state. */
export function announcePairPhoneClosed(): void {
  window.dispatchEvent(new Event(CLOSED_EVENT));
}

/** Subscribes to `announcePairPhoneClosed`; returns the unsubscribe. */
export function onPairPhoneClosed(handler: () => void): () => void {
  window.addEventListener(CLOSED_EVENT, handler);
  return () => window.removeEventListener(CLOSED_EVENT, handler);
}
