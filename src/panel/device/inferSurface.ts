import type { PanelSurface } from '../types';

// A Y70 is a uniquely tall, narrow strip: the 2.5K is 682x2560 (3.75:1) and the
// 4K is 1100x3840 (3.5:1). No phone or tablet is anywhere near that tall, so the
// long/short aspect ratio is what identifies it - and aspect is invariant to
// Windows display scaling (devicePixelRatio divides both axes equally). The
// previous CSS-width cutoff was brittle for exactly that reason: the 682px-wide
// 2.5K at 100% scaling slipped under a 720px mobile threshold and was misread as
// a phone (which then halved its DPI and doubled its grid columns), while the 4K
// at 150% scaling (734px CSS) escaped. Below this we treat it as the Y70.
const Y70_MIN_ASPECT = 3;

/**
 * Pick the surface classification for a freshly-registering device from its
 * viewport, stamped on the device record to drive widget filtering and grid
 * sizing.
 *
 * Layouts:
 *   - Y70: tall narrow strip (>= 3:1), the Edge-on-Windows kiosk.
 *   - Q-series (Q60/Q80): 720x1280 portrait AIO LCD (Android WebView).
 *   - Phone / generic mobile: anything squarer (well under 3:1).
 */
export function inferSurfaceFromViewport(isPhoneHint: boolean): PanelSurface {
  if (typeof window === 'undefined') return 'y70';
  if (isPhoneHint) return 'phone';
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Q-series (720x1280 portrait): match the exact fullscreen native size.
  if (width === 720 && height === 1280) return 'q60';
  const longSide = Math.max(width, height);
  const shortSide = Math.max(1, Math.min(width, height));
  if (longSide / shortSide >= Y70_MIN_ASPECT) return 'y70';
  // Squarer / narrower viewport: a phone or tablet (a phone browsing /panel
  // directly; paired phones already returned above via isPhoneHint).
  return 'phone';
}
