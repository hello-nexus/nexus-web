import { fetchService, postService } from './service';

/** One ROG Astral card's Level Sense, from its G-sensor. */
export interface AstralLevelSenseGpu {
  gpuId: string;
  /** The card as the GPU list names it, e.g. "ASUS ROG Astral RTX 5090". */
  name: string;
  /** A calibration is being taken right now. */
  calibrating: boolean;
  /** When the level in use was taken (Unix ms); null before the first calibration is saved. */
  calibratedAtMs: number | null;
  /** Degrees against that level, null until the card has one: + the free end sits lower. */
  sag?: number | null;
  /** Degrees against that level, null until the card has one: + the top edge turns toward the fans. */
  lean?: number | null;
}

export interface AstralLevelSense {
  /** Every card with a G-sensor; empty when there is none. */
  gpus: AstralLevelSenseGpu[];
}

export const getAstralLevelSense = () => fetchService<AstralLevelSense>('/diagnostics/gpu/level-sense');

/** Takes each card's current position as level; the ids of the cards now calibrating, empty when none has a G-sensor. */
export const calibrateAstralLevelSense = () =>
  postService<{ gpus: string[] }>('/diagnostics/gpu/level-sense/calibrate', {});

/** The Power detector's settings, as GPU Tweak III has them. */
export interface AstralPowerSettings {
  trayAlerts: boolean;
  inAppAlerts: boolean;
  equalizer: boolean;
  hideEqualizerReminder: boolean;
  overcurrentShutdown: boolean;
  overcurrentSeconds: number;
  countdownSeconds: number;
  criticalShutdown: boolean;
}

export interface AstralPowerGpu {
  gpuId: string;
  name: string;
  /** Each 12V pin's current in amps, pin 1 first. */
  pinAmps: number[];
  readAtMs: number;
}

/** A shutdown countdown the detector started. */
export interface AstralPowerCountdown {
  reason: string;
  startedAtMs: number;
  endsAtMs: number;
  text: string;
}

/** The latest alert, for the in-app pop-up (only when in-app alerts are on). */
export interface AstralPowerAlert {
  id: number;
  level: 'warning' | 'overcurrent' | 'critical' | string;
  title: string;
  text: string;
  atMs: number;
}

export interface AstralPowerState {
  /** A card's power monitor answered. */
  supported: boolean;
  gpus: AstralPowerGpu[];
  level: string;
  overcurrentAmps: number;
  criticalAmps: number;
  pinWarnAmps: number;
  pinLowAmps: number;
  pinCautionAmps: number;
  countdown: AstralPowerCountdown | null;
  shuttingDown: boolean;
  /** A cancelled countdown: no new one starts until the current is back to normal. */
  heldOff: boolean;
  alert: AstralPowerAlert | null;
  settings: AstralPowerSettings;
}

export const getAstralPower = () => fetchService<AstralPowerState>('/diagnostics/gpu/power-detector');

/** Changes some settings; the state after it, or null when the service refused or was unreachable. */
export const setAstralPowerConfig = (patch: Partial<AstralPowerSettings>) =>
  postService<AstralPowerState>('/diagnostics/gpu/power-detector/config', patch);

/** Cancels a running shutdown countdown. */
export const cancelAstralShutdown = () =>
  postService<{ ok: boolean }>('/diagnostics/gpu/power-detector/cancel', {});

/** Shuts down now instead of at the end of the running countdown; it can never start a shutdown. */
export const astralShutdownNow = () =>
  postService<{ ok: boolean }>('/diagnostics/gpu/power-detector/shutdown-now', {});
