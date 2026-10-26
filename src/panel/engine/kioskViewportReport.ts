import type { KioskViewportDto } from '../../api/panel';

const DEBOUNCE_MS = 500;

/** Whether this window is the host-launched kiosk: top-level, with the origin the host puts on its URL; a browser tab or the dashboard preview never reports. */
export function isHostKiosk(win: Pick<Window, 'location' | 'top' | 'self'>): boolean {
  if (win.top !== win.self) return false;
  const params = new URLSearchParams(win.location.search);
  return params.has('originX') && !params.has('simulator');
}

/** Reports the window's size and pixel ratio after a resize settles, only when it differs from the stored one. Returns the teardown. */
export function kioskViewportReporter(
  win: Window,
  deviceId: string,
  stored: () => KioskViewportDto | null,
  report: (deviceId: string, viewport: KioskViewportDto) => void,
): () => void {
  if (!isHostKiosk(win)) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = () => {
    timer = null;
    const dpr = Number.isFinite(win.devicePixelRatio) && win.devicePixelRatio > 0 ? win.devicePixelRatio : 1;
    const next = { cssWidth: Math.max(1, Math.round(win.innerWidth)), cssHeight: Math.max(1, Math.round(win.innerHeight)), dpr };
    const current = stored();
    if (current && current.cssWidth === next.cssWidth && current.cssHeight === next.cssHeight && Math.abs(current.dpr - next.dpr) < 1e-6) return;
    report(deviceId, next);
  };
  const schedule = () => {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(check, DEBOUNCE_MS);
  };
  schedule();
  win.addEventListener('resize', schedule);
  return () => {
    if (timer != null) clearTimeout(timer);
    win.removeEventListener('resize', schedule);
  };
}
