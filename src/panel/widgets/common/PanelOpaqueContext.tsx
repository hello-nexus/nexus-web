// A grid tile reports that it paints every pixel of its box, so a
// single-widget panel can stop drawing the background it hides. PanelApp
// provides it around the page grid only; previews, the immersive overlay and
// every other mount point report into nothing.
import { createContext, useContext, useEffect } from 'react';

const PanelOpaqueContext = createContext<((widgetId: string, opaque: boolean) => void) | null>(null);

export const PanelOpaqueProvider = PanelOpaqueContext.Provider;

export function useReportOpaque(widgetId: string, opaque: boolean): void {
  const report = useContext(PanelOpaqueContext);
  useEffect(() => {
    if (!report || !opaque) return;
    report(widgetId, true);
    return () => report(widgetId, false);
  }, [report, widgetId, opaque]);
}
