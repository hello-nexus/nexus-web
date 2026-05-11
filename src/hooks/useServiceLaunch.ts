import { useEffect, useState } from 'react';

// Module-level launch state shared across every ServiceLaunchButton instance
// AND useServiceStatus poller. Clicking Launch in any place sets a single
// global "launching" flag; useServiceStatus reads it to drop polling cadence
// from 5s to 500ms while the flag is set so the UI catches the elevated
// child the instant it binds the port. The flag auto-clears either when the
// service comes online (via resolveLaunch) or after a 10s timeout.

const LAUNCH_TIMEOUT_MS = 10_000;

let launching = false;
let timeoutId: number | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function clearTimer() {
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
    timeoutId = null;
  }
}

export function isLaunching(): boolean {
  return launching;
}

export function triggerLaunch(): void {
  if (launching) return;
  launching = true;
  clearTimer();
  timeoutId = window.setTimeout(() => {
    launching = false;
    timeoutId = null;
    notify();
  }, LAUNCH_TIMEOUT_MS);
  notify();

  // Use a hidden iframe to invoke the protocol handler so the browser
  // doesn't navigate or show "couldn't open URL" prompts when no handler
  // is registered. Most browsers fire the protocol-handler resolve inside
  // the iframe load attempt and silently fail the load itself.
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = 'qos://start-admin';
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try { iframe.remove(); } catch { /* ignore */ }
    }, 200);
  } catch {
    window.location.href = 'qos://start-admin';
  }
}

export function resolveLaunch(): void {
  if (!launching) return;
  clearTimer();
  launching = false;
  notify();
}

export function useLaunchState(): boolean {
  const [state, setState] = useState(launching);
  useEffect(() => {
    const fn = () => setState(launching);
    listeners.add(fn);
    fn();
    return () => { listeners.delete(fn); };
  }, []);
  return state;
}
