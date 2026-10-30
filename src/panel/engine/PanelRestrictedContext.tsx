import { createContext, useContext } from 'react';

// True while a kiosk panel is in Restricted mode (active while Windows is in OOBE); widgets that mix
// allowed and blocked controls (the Deck) read it instead of a prop chain.
const PanelRestrictedContext = createContext(false);

export function usePanelRestricted(): boolean {
  return useContext(PanelRestrictedContext);
}

export const PanelRestrictedProvider = PanelRestrictedContext.Provider;
