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
