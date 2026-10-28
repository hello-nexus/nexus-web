import { createContext, useContext } from 'react';
import type { PanelWidget } from '../../types';

// PanelApp's cell-tap handler, so a control inside a widget does what a tap on the cell does on this surface. Null outside PanelApp.
const PanelOpenWidgetContext = createContext<((widget: PanelWidget) => void) | null>(null);

export function usePanelOpenWidget(): ((widget: PanelWidget) => void) | null {
  return useContext(PanelOpenWidgetContext);
}

export const PanelOpenWidgetProvider = PanelOpenWidgetContext.Provider;
