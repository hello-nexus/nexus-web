// True inside the panel's fullscreen immersive overlay (PanelImmersiveOverlay
// provides it). Default false, so tiles, edit sheets, previews, and every
// other mount point read "not immersive" without a provider. Composites that
// change behavior between tile and fullscreen (ui-avatar gates its pointer
// gestures on this) read it null-safely, matching PanelPreviewContext.
import { createContext, useContext } from 'react';

const PanelImmersiveContext = createContext(false);

export function usePanelImmersive(): boolean {
  return useContext(PanelImmersiveContext);
}

export const PanelImmersiveProvider = PanelImmersiveContext.Provider;

// True while an immersive overlay covers the panel's pages (PanelApp provides
// it), so tiles underneath can stop animating. Content inside the overlay reads
// usePanelImmersive() to tell itself apart.
const PanelImmersiveOpenContext = createContext(false);

export function usePanelImmersiveOpen(): boolean {
  return useContext(PanelImmersiveOpenContext);
}

export const PanelImmersiveOpenProvider = PanelImmersiveOpenContext.Provider;
