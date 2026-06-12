import type { PanelSurface } from '../types';

/**
 * Pick the surface classification for a freshly-registering device from its
 * viewport, stamped on the device record to drive widget filtering.
 *
 * Layouts:
 *   - Y70: 682x2560 portrait kiosk (Edge on Windows)
 *   - Q-series (Q60/Q80): 720x1280 portrait AIO LCD (Android WebView)
 *   - Phone / generic mobile: anything else narrow.
 */
export function inferSurfaceFromViewport(isPhoneHint: boolean): PanelSurface {
  if (typeof window === 'undefined') return 'y70';
  if (isPhoneHint) return 'phone';
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Q-series (720x1280 portrait): match the exact fullscreen native size.
  if (width === 720 && height === 1280) return 'q60';
  // Mobile-shaped viewport: portrait, narrow.
  const isMobile = width <= 480
    || (width <= 720 && height > width);
  if (isMobile) return 'phone';
  return 'y70';
}
