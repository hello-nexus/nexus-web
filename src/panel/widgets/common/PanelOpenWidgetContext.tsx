import { createContext, useContext } from 'react';
import type { PanelWidget } from '../../types';

type CellTapResolver = (widget: PanelWidget) => (() => void) | null;

// Resolves what a tap on a widget's cell does on this surface (the action, or null when nothing). Null outside PanelApp.
const PanelOpenWidgetContext = createContext<CellTapResolver | null>(null);

export function usePanelOpenWidget(): CellTapResolver | null {
  return useContext(PanelOpenWidgetContext);
}

export const PanelOpenWidgetProvider = PanelOpenWidgetContext.Provider;
