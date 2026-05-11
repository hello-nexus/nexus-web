// Iframe-hosted entrypoint for /panel?simulator=1. Mirrors the shape of
// PanelEmbeddedContent (dashboard) but feeds layout + theme + selection
// from the parent via postMessage instead of usePanelLayout/usePanelTheme.

import { ErrorBoundary } from '../../components/ErrorBoundary';
import { PanelContent } from '../PanelApp';
import { useSimulatorLayoutState } from './useSimulatorLayoutState';

export function PanelSimulatorContent() {
  const sim = useSimulatorLayoutState();
  if (!sim.ready || !sim.theme) return null;
  return (
    <ErrorBoundary label="PanelSimulator">
      <PanelContent
        surface={sim.surface}
        layoutState={sim.layoutState}
        simulator
        simulatorTheme={sim.theme}
        simulatorThemeMode={sim.themeMode}
        simulatorSelectedWidgetId={sim.selectedWidgetId}
        onSimulatorWidgetClicked={sim.onWidgetClicked}
        onSimulatorBackgroundClicked={sim.onBackgroundClicked}
      />
    </ErrorBoundary>
  );
}
