import { createContext, useContext } from 'react';

/** Zoom a panel host gives dialogs portaled out of it; 1 leaves the dashboard unchanged. */
export const OverlayScaleContext = createContext(1);

export function useOverlayScale(): number {
  return useContext(OverlayScaleContext);
}
