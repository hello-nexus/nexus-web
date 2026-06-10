// Preview mode for the add-widget catalog: widgets render their real layout
// from a co-located mock fixture and skip every data effect (polls, sockets,
// embeds). Default false, so every live mount point (grid, edit sheets, touch
// views, drag overlay) behaves unchanged without a provider. SDK apps get the
// symmetric signal via SandboxContext.preview → the SDK runtime's usePreview().
import { createContext, useContext } from 'react';

const PanelPreviewContext = createContext(false);

export function usePanelPreview(): boolean {
  return useContext(PanelPreviewContext);
}

export const PanelPreviewProvider = PanelPreviewContext.Provider;
