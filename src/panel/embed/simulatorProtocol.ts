// postMessage protocol used between PanelDeviceModal (parent) and the
// iframe-hosted /panel?simulator=1 runtime. The parent owns the canonical
// layout and theme; the iframe is a renderer + interaction surface that
// echoes user actions back as 'layout-changed' messages. This mirrors how
// the real device works: layout state lives outside the kiosk render and
// the kiosk is told what to draw.

import type { PanelLayout, PanelSurface } from '../types';
import type { PanelThemeSettingsState } from '../editor/PanelThemeSettings';

export type SimulatorTheme = PanelThemeSettingsState;

export const SIMULATOR_QUERY_FLAG = 'simulator';

export interface SimulatorReadyMessage {
  type: 'simulator/ready';
}

export interface SimulatorInitMessage {
  type: 'simulator/init';
  surface: PanelSurface;
  layout: PanelLayout;
  theme: SimulatorTheme;
  themeMode: 'dark' | 'light';
  selectedWidgetId: string | null;
  brightness: number;
  screenOn: boolean;
  showPanel: boolean;
}

export interface SimulatorSetDisplayMessage {
  type: 'simulator/set-display';
  brightness: number;
  screenOn: boolean;
  showPanel: boolean;
}

export interface SimulatorSetLayoutMessage {
  type: 'simulator/set-layout';
  layout: PanelLayout;
}

export interface SimulatorSetThemeMessage {
  type: 'simulator/set-theme';
  theme: SimulatorTheme;
  themeMode: 'dark' | 'light';
}

export interface SimulatorSetSelectionMessage {
  type: 'simulator/set-selection';
  widgetId: string | null;
}

export interface SimulatorLayoutChangedMessage {
  type: 'simulator/layout-changed';
  layout: PanelLayout;
}

export interface SimulatorWidgetClickedMessage {
  type: 'simulator/widget-clicked';
  widgetId: string;
}

export interface SimulatorBackgroundClickedMessage {
  type: 'simulator/background-clicked';
}

export type SimulatorParentToChild =
  | SimulatorInitMessage
  | SimulatorSetLayoutMessage
  | SimulatorSetThemeMessage
  | SimulatorSetSelectionMessage
  | SimulatorSetDisplayMessage;

export type SimulatorChildToParent =
  | SimulatorReadyMessage
  | SimulatorLayoutChangedMessage
  | SimulatorWidgetClickedMessage
  | SimulatorBackgroundClickedMessage;

export type SimulatorMessage = SimulatorParentToChild | SimulatorChildToParent;

const PREFIX = 'simulator/';

export function isSimulatorMessage(data: unknown): data is SimulatorMessage {
  return typeof data === 'object'
    && data !== null
    && typeof (data as { type?: unknown }).type === 'string'
    && (data as { type: string }).type.startsWith(PREFIX);
}
