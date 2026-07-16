// Install-time defaults API. The service serves two endpoints from the same
// JSON shape:
//   - /defaults - the embedded values from
//     nexus-service/data/install-defaults.json
//   - /defaults/snapshot - every field projected from the running
//     NexusSettings, for regenerating install-defaults.json from live config

import { fetchService } from './service';

export interface InstallDefaultsDocument {
  theme: { language: string; themeMode: string; accentColor: string };
  monitoring: { showMacStatusBarIcon: boolean; showWindowsTrayIcon: boolean };
  panel: {
    autoLaunch: boolean;
    themeSyncWithDesktop: boolean;
    themeMode: string;
    accentSyncWithDesktop: boolean;
    backgroundMode: string;
    backgroundEffect: string;
    backgroundTemplate: number;
    backgroundOpacity: number;
    widgetOpacity: number;
    widgetLabels: boolean;
    layouts: Record<'desktop' | 'y70' | 'phone' | 'q60', {
      layoutSchemaVersion: number;
      surface: string;
      widgets: {
        type: string;
        size: string;
        col: number;
        row: number;
        config?: Record<string, unknown>;
      }[];
    }>;
  };
  overlay: { enabled: boolean; alwaysOnTop: boolean; scale: number; opacity: number; monitor: number };
  lighting: {
    sync: string;
    brightnessEnabled: boolean;
    speedEnabled: boolean;
    frameRate: number;
    scaleRatio: number;
    musicReactive: boolean;
    staticColor: { r: number; g: number; b: number };
    animate: { effect: string; state: { speed: number; intensity: number; hue: number; colorize: number; saturation: number; contrast: number } };
    postProcess: { hue: number; colorize: number; saturation: number; contrast: number };
    devicePreference: { brightness: number; saturation: number };
  };
  y70: { orientation: string; brightness: number; screenOff: boolean };
  keeb: {
    rotaryLeft: string;
    rotaryRight: string;
    rotarySensitivity: string;
    firmwareLighting: { animationMode: string; speed: string; direction: string; brightness: number; keyReactive: boolean; keyReactiveMask: boolean; keyReactiveMode: string };
  };
  cooling: {
    globalSpeedModifier: number;
    activePreset: string;
    presets: Record<string, { responseTime: number; minTemp: number; maxTemp: number; minSpeed: number; maxSpeed: number }>;
    deviceLayoutSize: { w: number; h: number };
  };
  obs: { host: string; port: number };
  screenTime: { trackingEnabled: boolean };
  cnvs: { playAnimation: boolean; playWhenPCOff: boolean };
  auth: { remoteControlEnabled: boolean };
}

export const fetchInstallDefaults = () =>
  fetchService<InstallDefaultsDocument>('/defaults');

export const fetchInstallDefaultsSnapshot = () =>
  fetchService<InstallDefaultsDocument>('/defaults/snapshot');
