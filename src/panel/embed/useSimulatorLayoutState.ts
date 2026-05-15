// Hook used by the iframe-hosted /panel?simulator=1 runtime. The parent
// (PanelDeviceModal) owns the canonical layout + theme; this hook exposes
// a PanelLayoutState shape backed by postMessage, so PanelContent can
// render without ever fetching from /panel/devices/*. User edits inside
// the iframe are echoed back to the parent via 'simulator/layout-changed'.

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
  layoutState: PanelLayoutState;
  theme: SimulatorTheme | null;
  themeMode: 'dark' | 'light';
  selectedWidgetId: string | null;
  brightness: number;
  screenOn: boolean;
  showPanel: boolean;
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
  // Parent is always same-origin (the simulator iframe is loaded from
  // the same dev/service host that hosts the parent dashboard), so pin
  // the target to window.location.origin instead of '*'.
  window.parent.postMessage(message, window.location.origin);
}

export function useSimulatorLayoutState(): SimulatorRuntimeState {
  const [ready, setReady] = useState(false);
  const [surface, setSurface] = useState<PanelSurface>('y70');
  const [layout, setLayoutLocal] = useState<PanelLayout>(SIMULATOR_FALLBACK_LAYOUT);
  const [theme, setTheme] = useState<SimulatorTheme | null>(null);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [screenOn, setScreenOn] = useState(true);
  const [showPanel, setShowPanel] = useState(true);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!isSimulatorMessage(data)) return;
      switch (data.type) {
        case 'simulator/init': {
          setSurface(data.surface);
          setLayoutLocal(data.layout);
          setTheme(data.theme);
          setThemeMode(data.themeMode);
          setSelectedWidgetId(data.selectedWidgetId);
          setBrightness(data.brightness);
          setScreenOn(data.screenOn);
          setShowPanel(data.showPanel);
          setReady(true);
          break;
        }
        case 'simulator/set-layout': {
          setLayoutLocal(data.layout);
          break;
        }
        case 'simulator/set-theme': {
          setTheme(data.theme);
          setThemeMode(data.themeMode);
          break;
        }
        case 'simulator/set-selection': {
          setSelectedWidgetId(data.widgetId);
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
    layoutState,
    theme,
    themeMode,
    selectedWidgetId,
    brightness,
    screenOn,
    showPanel,
    onWidgetClicked,
    onBackgroundClicked,
  };
}
