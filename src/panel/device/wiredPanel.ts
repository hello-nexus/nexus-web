import type { PanelSurface } from '../types';

/** True when the surface is always physically wired to the host (no WiFi path). */
export function isWiredPanel(surface: PanelSurface): boolean {
  return surface === 'y70' || surface === 'monitor' || surface === 'q60'
    || (surface === 'phone' && localStorage.getItem('nexus_link') === 'usb');
}

/** 'cabled' = q60 or USB phone; 'host-display' = y70 or monitor. */
export function wiredPanelClass(surface: PanelSurface): 'cabled' | 'host-display' | null {
  if (surface === 'q60') return 'cabled';
  if (surface === 'phone' && localStorage.getItem('nexus_link') === 'usb') return 'cabled';
  if (surface === 'y70' || surface === 'monitor') return 'host-display';
  return null;
}

/**
 * True when turning the panel background off shows the Windows desktop: the
 * page is hosted by the local kiosk WebView2, which composites transparent
 * pixels over the desktop. Surface alone is not enough - full-size streamed
 * panels (D213) also carry the 'monitor' surface but render via H.264 capture
 * with no desktop behind the glass; only display-bound records (promoted OS
 * monitors, displayId set) and the Y70 qualify.
 */
export function supportsDesktopSeeThrough(surface: PanelSurface, displayBound: boolean): boolean {
  return surface === 'y70' || (surface === 'monitor' && displayBound);
}
