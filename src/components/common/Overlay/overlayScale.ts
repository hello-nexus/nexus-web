import { createContext, useContext } from 'react';

/**
 * Zoom factor for centered dialogs portaled out of a scaled panel host.
 *
 * An Overlay renders into document.body, outside the panel's own zoom, so on a
 * touch panel (Y70 class) its dialogs would stay at desktop size while the
 * sheet that opened them is scaled with the panel content. A panel host
 * provides its chrome scale here and Overlay zooms its surface by it, the same
 * way the editor sheet zooms itself. 1 (the default) leaves the dashboard as is.
 */
export const OverlayScaleContext = createContext(1);

export function useOverlayScale(): number {
  return useContext(OverlayScaleContext);
}
