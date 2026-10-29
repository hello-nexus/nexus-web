// Whether this device kiosk render is a real promoted OS display
// (PanelDeviceRecord.displayId set) rather than the streamed-panels engine's
// off-screen capture, which navigates the SAME /panel/{deviceId} route under
// the 'monitor' surface for the ArtInChip D213 (see PanelSurfaces.Monitor /
// D213PanelDiscovery.cs in nexus-service). Surface alone cannot tell them
// apart; PanelKioskContent provides the per-device record's real value, so
// only that one path ever overrides the default.
import { createContext, useContext } from 'react';

const PanelDisplayBoundContext = createContext(true);

export function usePanelDisplayBound(): boolean {
  return useContext(PanelDisplayBoundContext);
}

export const PanelDisplayBoundProvider = PanelDisplayBoundContext.Provider;

const PanelGenericDisplayContext = createContext(false);

// A promoted OS display no curated device claims: it has no immersive mode and cannot rotate.
export function usePanelGenericDisplay(): boolean {
  return useContext(PanelGenericDisplayContext);
}

export const PanelGenericDisplayProvider = PanelGenericDisplayContext.Provider;

// The panel's own digitizer flag; generic-display widgets are handed input regardless of it.
const PanelDigitizerContext = createContext<boolean | undefined>(undefined);

export function usePanelDigitizer(): boolean | undefined {
  return useContext(PanelDigitizerContext);
}

export const PanelDigitizerProvider = PanelDigitizerContext.Provider;
