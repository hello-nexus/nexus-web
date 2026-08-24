// FanControl (Rem0o) detection + import - loopback-only endpoints on the local
// service. Mirrors src/api/migration.ts, which serves the Nexus 2 import.

import { fetchService, postService } from './service';

export interface FanControlConfigFile {
  path: string;
  name: string;
  modifiedUnixMs: number;
  isDefault: boolean;
}

export interface FanControlStatusResponse {
  detected: boolean;
  running: boolean;
  importAvailable: boolean;
  autostartPresent: boolean;
  version?: string | null;
  installLocation?: string | null;
  configs: FanControlConfigFile[];
  /** Detected, importable, and not yet dismissed: the onboarding screen's gate. */
  pending: boolean;
  completed: boolean;
}

/** How a FanControl fan was matched to a local channel. */
export type FanControlMatch = 'exact' | 'normalized' | 'name' | 'position' | 'none';

/** Why a curve cannot be imported. The service sends the code; the wording lives here. */
export type FanControlReasonCode =
  | 'rpmMode' | 'noSensor' | 'noPoints' | 'badPoints'
  | 'noSyncSource' | 'noMixMembers' | 'noSpeedRange' | 'cycle' | 'unknownKind';

export interface FanControlCurvePreview {
  name: string;
  sourceKind: string;
  targetType: string;
  supported: boolean;
  reasonCode?: FanControlReasonCode | null;
  /** Fills the reason's placeholder where it has one (the FanControl curve kind). */
  reasonDetail?: string | null;
  sensorName?: string | null;
  fanNames: string[];
}

/** Something the import leaves behind, as a code plus how many items it covers. */
export interface FanControlSkipNote {
  code: 'fansMissing' | 'rpmCurves' | 'startStop' | 'smoothing';
  count: number;
}

export interface FanControlFanPreview {
  identifier: string;
  sourceName: string;
  channelId?: string | null;
  channelName?: string | null;
  match: FanControlMatch;
  nickName?: string | null;
  hasCalibration: boolean;
  manualDuty?: number | null;
  offset: number;
  curveName?: string | null;
}

export interface FanControlPreviewResponse {
  available: boolean;
  configName: string;
  version: number;
  curves: FanControlCurvePreview[];
  fans: FanControlFanPreview[];
  skipped: FanControlSkipNote[];
  curveCount: number;
  calibrationCount: number;
  nameCount: number;
  offsetCount: number;
  manualCount: number;
  error: boolean;
  msg: string;
}

export type FanControlCategory = 'curves' | 'calibration' | 'names' | 'offsets' | 'manual';

export interface FanControlApplyResponse {
  error: boolean;
  msg: string;
  curvesImported: number;
  calibrationsImported: number;
  namesImported: number;
  offsetsImported: number;
  manualImported: number;
}

// nexus-service's ApiResponse envelope.
export interface FanControlActionResponse {
  error: boolean;
  msg: string;
}

export const fetchFanControlStatus = () =>
  fetchService<FanControlStatusResponse>('/migration/fancontrol');

export const previewFanControlImport = (configPath?: string) =>
  postService<FanControlPreviewResponse>('/migration/fancontrol/preview', { configPath: configPath ?? '' });

export const applyFanControlImport = (configPath: string, categories: FanControlCategory[]) =>
  postService<FanControlApplyResponse>('/migration/fancontrol/apply', { configPath, categories });

export const dismissFanControlImport = () =>
  postService<{ dismissed: boolean }>('/migration/fancontrol/dismiss', {});

export const closeFanControlApp = () =>
  postService<FanControlActionResponse>('/migration/fancontrol/close-app', {});

export const disableFanControlAutostart = () =>
  postService<FanControlActionResponse>('/migration/fancontrol/disable-autostart', {});
