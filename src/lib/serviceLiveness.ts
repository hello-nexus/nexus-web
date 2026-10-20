// Grace before a host-display panel declares the local service offline. A
// host-display surface (Y70/monitor) is the host's own screen - it can't be
// unplugged as a normal action, so a single failed /ping is almost always a
// transient hiccup (e.g. the ping starved behind a burst of slow /shortcuts/icon
// requests while browsing apps in the deck editor), not a real outage. Flipping
// offline on the first miss tears down an open editor (PanelApp's isOffline
// effect), so a host-display panel holds its last good state until the service
// is unreachable this long. Cabled surfaces (q60, USB phone) deliberately keep
// the instant-offline path: pulling the cable is a real user-initiated
// disconnect that should surface right away.
export const HOST_DISPLAY_OFFLINE_GRACE_MS = 30_000;

// Grace before the desktop dashboard declares the local service offline. The
// dashboard runs against the host's own service, so a single failed /ping is
// almost always a transient hiccup - most visibly a display-mode change (the
// Y70 auto-orientation rotate) blinking the WebView2 network for a beat - not a
// real outage. Holding last-known-good this long stops a rotate from flashing
// "service required" while keeping a sustained outage visible.
export const DESKTOP_OFFLINE_GRACE_MS = 8_000;

// Backstop only: a LAN phone's hold ends sooner once the service goes silent.
export const PHONE_OFFLINE_GRACE_MS = HOST_DISPLAY_OFFLINE_GRACE_MS;

/**
 * always     - hold every miss inside the grace
 * while-live - hold only while the service showed a sign of life recently
 * never      - no hold; a running hold reports offline at once
 */
export type OfflineHold = 'always' | 'while-live' | 'never';

let lastAnsweredAt = 0;

/** Records a sign of life from the service: a REST response of any status, or a multiplex frame. */
export function markServiceAnswered(): void {
  lastAnsweredAt = Date.now();
}

/** Wall-clock ms of the last markServiceAnswered, 0 before any. */
export function serviceAnsweredAt(): number {
  return lastAnsweredAt;
}
