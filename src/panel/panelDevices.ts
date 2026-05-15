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
  /// <summary>Panel surface supports see-through rendering over the desktop
  /// wallpaper (Panel Opacity slider). True for monitor-attached panels.</summary>
  transparency: boolean;
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
