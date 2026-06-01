import type { PanelSurface } from './types';

export type PanelConnectionKind = 'attached-monitor' | 'usb-display' | 'external-browser' | 'simulated';
export type PanelManagementMode = 'managed' | 'self-managed' | 'managed-test';
export type PanelDeviceStatus = 'online' | 'offline' | 'paired' | 'recently-active' | 'running';
export type PanelDeviceModalKind = 'y70-compat' | 'panel-editor';

export interface PanelDeviceCapabilities {
  layout: boolean;
  theme: boolean;
  displayControls: boolean;
  launchClose: boolean;
  pairing: boolean;
  presence: boolean;
  touch: boolean;
}

export interface PanelDevice {
  id: string;
  name: string;
  subtitle: string;
  status: PanelDeviceStatus;
  statusLabel: string;
  connectionKind: PanelConnectionKind;
  managementMode: PanelManagementMode;
  surfaceProfileKey: string;
  runtimeSurface?: PanelSurface;
  previewSize?: { width: number; height: number };
  previewDpi?: number;
  iconSrc: string;
  capabilities: PanelDeviceCapabilities;
  modalKind?: PanelDeviceModalKind;
  sourceId?: string;
  displayId?: string;
}

export const PANEL_DEVICE_ICON = '/assets/devices/y70.svg';
export const PANEL_MONITOR_ICON = '/assets/devices/device.svg';

// Per-panel-family icon for PanelDevice.iconSrc, so the sidebar DEVICES
// section shows each panel's own silhouette. Falls back to PANEL_DEVICE_ICON
// for unknown source ids.
export const PANEL_FAMILY_ICONS: Readonly<Record<string, string>> = {
  y70:      '/assets/devices/y70.svg',
  // Y70 Touch 4K shares the Y70 silhouette (same case + screen aperture).
  'y70-4k': '/assets/devices/y70.svg',
  q60:      '/assets/devices/q60.svg',
  q80:      '/assets/devices/q80.svg',
  // Q-series enumerates Q60 + Q80 under one id; the Q60 silhouette is the
  // family default.
  qseries:  '/assets/devices/q60.svg',
};

export function panelIconForSource(sourceId: string): string {
  return PANEL_FAMILY_ICONS[sourceId] ?? PANEL_DEVICE_ICON;
}
