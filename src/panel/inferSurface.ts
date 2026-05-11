import type { PanelSurface } from './types';

/**
 * Decide which legacy "surface" classification the panel runtime should use
 * for a freshly-registering device. Pre-AMP-84 the surface was carried by
 * the URL (/panel/y70 vs /panel/phone vs /panel/q60). With per-device URLs
 * we infer it once from the viewport at register time and stamp it on the
 * device record so widget filtering keeps working unchanged.
 *
 * The Y70 panel runs Edge kiosk on a 682x2560 portrait display; the Q60 LCD
 * is a tiny landscape strip. Anything else assumed to be a phone or generic
 * browser pane defaults to 'phone' when the caller signals it (PWA / pair
 * flow), else 'y70' as the safe widest-default.
 */
export function inferSurfaceFromViewport(isPhoneHint: boolean): PanelSurface {
  if (typeof window === 'undefined') return 'y70';
  if (isPhoneHint) return 'phone';
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Q60: ~480x128 landscape LCD strip.
  if (width <= 720 && height <= 320) return 'q60';
  // Mobile-shaped viewport: portrait, narrow.
  const isMobile = width <= 480
    || (width <= 720 && height > width);
  if (isMobile) return 'phone';
  return 'y70';
}
