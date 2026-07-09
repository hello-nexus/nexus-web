// Hook for the iframe-hosted /panel?simulator=1 runtime. PanelDeviceModal owns
// the canonical layout + theme; this exposes a PanelLayoutState backed by
// postMessage so PanelContent renders without fetching /panel/devices/*. Edits
// are echoed back to the parent via 'simulator/layout-changed'.

import { useCallback, useEffect, useState } from 'react';
import type { PanelLayout, PanelSurface } from '../types';
import {
  isSimulatorMessage,
  type SimulatorChildToParent,
  type SimulatorTheme,
} from './simulatorProtocol';

interface PanelLayoutState {
  layout: PanelLayout;
  loaded: boolean;
  setLayout: (next: PanelLayout) => void;
}

export interface SimulatorRuntimeState {
  ready: boolean;
  surface: PanelSurface;
  // CSS-px density from 'simulator/init' (see SimulatorInitMessage.dpi).
  dpi: number | undefined;
  layoutState: PanelLayoutState;
  theme: SimulatorTheme | null;
  themeMode: 'dark' | 'light';
  selectedWidgetId: string | null;
  // Set when the parent rejects an action (e.g. a resize that can't fit);
  // drives a one-shot flash on the named widget. nonce re-fires repeats.
  flashSignal: { widgetId: string; nonce: number } | null;
  brightness: number;
  screenOn: boolean;
  showPanel: boolean;
  deviceId: string | null;
  onWidgetClicked: (id: string) => void;
  onBackgroundClicked: () => void;
}

const SIMULATOR_FALLBACK_LAYOUT: PanelLayout = {
  surface: 'y70',
  layoutSchemaVersion: 2,
  pages: [{ id: 'simulator-empty', widgets: [] }],
};

function postToParent(message: SimulatorChildToParent) {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return;
  // Parent is same-origin (iframe loads from the dashboard's host), so pin the
  // target to window.location.origin, not '*'.
  window.parent.postMessage(message, window.location.origin);
}

export function useSimulatorLayoutState(): SimulatorRuntimeState {
  const [ready, setReady] = useState(false);
  const [surface, setSurface] = useState<PanelSurface>('y70');
  const [dpi, setDpi] = useState<number | undefined>(undefined);
  const [layout, setLayoutLocal] = useState<PanelLayout>(SIMULATOR_FALLBACK_LAYOUT);
  const [theme, setTheme] = useState<SimulatorTheme | null>(null);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [screenOn, setScreenOn] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [flashSignal, setFlashSignal] = useState<{ widgetId: string; nonce: number } | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!isSimulatorMessage(data)) return;
      switch (data.type) {
        case 'simulator/init': {
          setSurface(data.surface);
          setDpi(data.dpi);
          setLayoutLocal(data.layout);
          setTheme(data.theme);
          setThemeMode(data.themeMode);
          setSelectedWidgetId(data.selectedWidgetId);
          setBrightness(data.brightness);
          setScreenOn(data.screenOn);
          setShowPanel(data.showPanel);
          if (data.deviceId !== undefined) setDeviceId(data.deviceId);
          setReady(true);
          break;
        }
        case 'simulator/set-layout': {
          setLayoutLocal(data.layout);
          break;
        }
        case 'simulator/set-grid': {
          setDpi(data.dpi);
          break;
        }
        case 'simulator/set-theme': {
          setTheme(data.theme);
          setThemeMode(data.themeMode);
          if (data.deviceId !== undefined) setDeviceId(data.deviceId);
          break;
        }
        case 'simulator/set-selection': {
          setSelectedWidgetId(data.widgetId);
          break;
        }
        case 'simulator/flash-widget': {
          setFlashSignal({ widgetId: data.widgetId, nonce: data.nonce });
          break;
        }
        case 'simulator/set-display': {
          setBrightness(data.brightness);
          setScreenOn(data.screenOn);
          setShowPanel(data.showPanel);
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    // Tell the parent we are alive and ready to receive 'simulator/init'.
    postToParent({ type: 'simulator/ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const setLayout = useCallback((next: PanelLayout) => {
    setLayoutLocal(next);
    postToParent({ type: 'simulator/layout-changed', layout: next });
  }, []);

  const onWidgetClicked = useCallback((id: string) => {
    postToParent({ type: 'simulator/widget-clicked', widgetId: id });
  }, []);

  const onBackgroundClicked = useCallback(() => {
    postToParent({ type: 'simulator/background-clicked' });
  }, []);

  const layoutState: PanelLayoutState = {
    layout,
    loaded: ready,
    setLayout,
  };

  return {
    ready,
    surface,
    dpi,
    layoutState,
    theme,
    themeMode,
    selectedWidgetId,
    flashSignal,
    brightness,
    screenOn,
    showPanel,
    deviceId,
    onWidgetClicked,
    onBackgroundClicked,
  };
}
