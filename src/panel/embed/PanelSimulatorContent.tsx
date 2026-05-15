// Iframe-hosted entrypoint for /panel?simulator=1. Mirrors the shape of
// PanelEmbeddedContent (dashboard) but feeds layout + theme + selection
// from the parent via postMessage instead of usePanelLayout/usePanelTheme.

import { ErrorBoundary } from '../../components/ErrorBoundary';
import { PanelContent } from '../PanelApp';
import { useSimulatorLayoutState } from './useSimulatorLayoutState';

// Brightness is mapped to a capped dim overlay so changes are visible
// without ever fully hiding content — a real screen at low brightness
// is still readable. Screen-off goes fully opaque.
const MAX_BRIGHTNESS_DIM = 0.6;

// Faux desktop wallpaper rendered behind the panel surface when Panel
// Opacity < 100 % so users can see how transparent the panel will be
// over the actual Windows wallpaper on real hardware. Conic gradient
// roughly approximates the Windows 11 "Bloom" stock wallpaper hue.
const FAUX_DESKTOP_BACKGROUND =
  'conic-gradient(from 200deg at 50% 50%, #1e3a8a, #2563eb, #7c3aed, #db2777, #f59e0b, #1e3a8a)';

export function PanelSimulatorContent() {
  const sim = useSimulatorLayoutState();
  if (!sim.ready || !sim.theme) return null;
  const dimOpacity = sim.screenOn
    ? Math.max(0, Math.min(MAX_BRIGHTNESS_DIM, ((100 - sim.brightness) / 100) * MAX_BRIGHTNESS_DIM))
    : 1;
  const showWallpaper = sim.panelOpacity < 1 && sim.showPanel;
  const panelLayerOpacity = sim.showPanel ? sim.panelOpacity : 1;
  return (
    <ErrorBoundary label="PanelSimulator">
      {showWallpaper && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            background: FAUX_DESKTOP_BACKGROUND,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}
      {sim.showPanel ? (
        <div style={{ position: 'absolute', inset: 0, opacity: panelLayerOpacity, transition: 'opacity 120ms linear' }}>
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
        </div>
      ) : (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            color: '#aaa',
            background: '#1a1a1a',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 32,
            textAlign: 'center',
            padding: 40,
          }}
        >
          <div style={{ fontSize: 48 }}>🖥️</div>
          <div>Panel hidden</div>
          <div style={{ fontSize: 20, color: '#666' }}>Desktop visible</div>
        </div>
      )}
      {dimOpacity > 0 && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            background: '#000',
            opacity: dimOpacity,
            transition: 'opacity 120ms linear',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        />
      )}
    </ErrorBoundary>
  );
}
