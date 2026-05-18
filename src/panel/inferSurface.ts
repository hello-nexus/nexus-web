import type { PanelSurface } from './types';

/**
 * Decide which legacy "surface" classification the panel runtime should use
 * for a freshly-registering device. Pre-substrate the surface was carried by
 * the URL (/panel/y70 vs /panel/phone vs /panel/q60). With per-device URLs
 * we infer it once from the viewport at register time and stamp it on the
 * device record so widget filtering keeps working unchanged.
 *
 * Layouts:
 *   - Y70: 682x2560 portrait kiosk (Edge on Windows)
 *   - Q-series (Q60/Q80): 720x1280 portrait AIO LCD (Android WebView).
 *     Bench-verified on a real Q60 (2026-05-15).
 *   - Phone / generic mobile: anything else narrow.
 */
export function inferSurfaceFromViewport(isPhoneHint: boolean): PanelSurface {
  if (typeof window === 'undefined') return 'y70';
  if (isPhoneHint) return 'phone';
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Q-series (720x1280 portrait). Match an exact-ish window since the
  // device's WebView is fullscreen at the native resolution.
  if (width === 720 && height === 1280) return 'q60';
  // Mobile-shaped viewport: portrait, narrow.
  const isMobile = width <= 480
    || (width <= 720 && height > width);
  if (isMobile) return 'phone';
  return 'y70';
}
