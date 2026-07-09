// Iframe-hosted entrypoint for /panel?simulator=1. Mirrors the shape of
// PanelEmbeddedContent (dashboard) but feeds layout + theme + selection
// from the parent via postMessage instead of usePanelLayout/usePanelTheme.

import { ErrorBoundary } from '../../components/common/ErrorBoundary/ErrorBoundary';
import { PanelContent } from '../PanelApp';
import { useTranslation } from '../../lib/i18n';
import { useSimulatorLayoutState } from './useSimulatorLayoutState';

// Brightness maps to a capped dim overlay so changes show without fully
// hiding content (a dim screen is still readable). Screen-off is fully opaque.
const MAX_BRIGHTNESS_DIM = 0.6;

export function PanelSimulatorContent() {
  const { t } = useTranslation();
  const sim = useSimulatorLayoutState();
  if (!sim.ready || !sim.theme) return null;
  const dimOpacity = sim.screenOn
    ? Math.max(0, Math.min(MAX_BRIGHTNESS_DIM, ((100 - sim.brightness) / 100) * MAX_BRIGHTNESS_DIM))
    : 1;
  return (
    <ErrorBoundary
      // eslint-disable-next-line i18next/no-literal-string -- crash-boundary diagnostic id
      label="PanelSimulator"
    >
      {sim.showPanel ? (
        <PanelContent
          surface={sim.surface}
          deviceId={sim.deviceId ?? undefined}
          deviceDpi={sim.dpi}
          layoutState={sim.layoutState}
          simulator
          simulatorTheme={sim.theme}
          simulatorThemeMode={sim.themeMode}
          simulatorSelectedWidgetId={sim.selectedWidgetId}
          simulatorFlashSignal={sim.flashSignal}
          onSimulatorWidgetClicked={sim.onWidgetClicked}
          onSimulatorBackgroundClicked={sim.onBackgroundClicked}
        />
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
            color: 'rgba(255, 255, 255, 0.66)',
            background: '#1a1a1a',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 32,
            textAlign: 'center',
            padding: 40,
          }}
        >
          {/* eslint-disable-next-line i18next/no-literal-string -- decorative emoji glyph */}
          <div style={{ fontSize: 48 }}>🖥️</div>
          <div>{t('panel.simulator.panelHidden')}</div>
          <div style={{ fontSize: 20, color: 'rgba(255, 255, 255, 0.4)' }}>{t('panel.simulator.desktopVisible')}</div>
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
