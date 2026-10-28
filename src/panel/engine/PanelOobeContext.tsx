import { createContext, useContext } from 'react';

// True while a kiosk panel is restricted for Windows OOBE; widgets that mix
// allowed and blocked controls (the Deck) read it instead of a prop chain.
const PanelOobeContext = createContext(false);

export function usePanelOobeRestricted(): boolean {
  return useContext(PanelOobeContext);
}

export const PanelOobeProvider = PanelOobeContext.Provider;
