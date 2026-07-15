import type { PanelSurface } from '../types';

// 'remote' is a panel that connects over the network - a paired phone/browser
// or the native app (a WKWebView around /panel/phone), all the same remote
// /panel/phone session. Contrast the hard-wired displays: 'attached-monitor'
// (Y70) and 'usb-display' (Q-series).
export type PanelConnectionKind = 'attached-monitor' | 'usb-display' | 'remote' | 'simulated';
export type PanelManagementMode = 'managed' | 'self-managed' | 'managed-test';
export type PanelDeviceStatus = 'online' | 'offline' | 'paired' | 'recently-active' | 'running';
export type PanelDeviceModalKind = 'y70-compat' | 'panel-editor';

// Whether a panel connects over the network (vs a display hard-wired to the
// host). The single place that means "remote"; extend it as new remote
// transports are added rather than checking connectionKind values inline.
export function isRemotePanel(kind: PanelConnectionKind | undefined): boolean {
  return kind === 'remote';
}

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
  // Device DPR paired with a CSS-px previewSize (hosted-monitor records), so
  // physical-size math can reconstruct native px before liveCanvas loads.
  previewDpr?: number;
  iconSrc: string;
  capabilities: PanelDeviceCapabilities;
  modalKind?: PanelDeviceModalKind;
  sourceId?: string;
  displayId?: string;
  // Server-side PanelDeviceRecord id when this entry is backed directly by a
  // record (promoted monitors). The editor binds by this id instead of the
  // surface-match scan, which breaks with several same-surface records.
  panelRecordId?: string;
  // Stamped from the backing curated DeviceListItem.warning (e.g. the Y70
  // connected as a monitor only, no USB serial channel).
  warning?: string | null;
  // Firmware-catalog key of the connected variant from the curated device
  // list (e.g. "y70-truly"); shown in settings for support diagnosis.
  firmwareType?: string;
  // Display-bound panel (promoted monitor): whether Nexus Control is on.
  // Absent for every other panel kind - there is no such toggle there.
  linkEnabled?: boolean;
}

export const PANEL_DEVICE_ICON = '/assets/devices/y70.svg';
export const PANEL_MONITOR_ICON = '/assets/devices/monitor.svg';

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
  // Corsair Xeneon Edge (simulated preset id; real units are promoted
  // monitors branded via capabilities.family in usePanelDevices).
  'xeneon-edge': '/assets/devices/corsair.svg',
};

export function panelIconForSource(sourceId: string): string {
  return PANEL_FAMILY_ICONS[sourceId] ?? PANEL_DEVICE_ICON;
}
