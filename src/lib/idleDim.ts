import type { IdleDimState } from '../api/lighting';

/** Idle times offered besides "when my screen turns off", in seconds. */
export const IDLE_DIM_TIMEOUTS: readonly number[] = [
  60, 120, 180, 300, 600, 900, 1200, 1500, 1800, 2700, 3600, 7200, 10800, 14400, 18000,
];

/** The timeout shown, and sent, where the display-off option is unavailable. */
export const IDLE_DIM_FALLBACK_TIMEOUT = 600;

/**
 * Maps a stored timeout onto an option the platform offers: 0 (follow the
 * display-off event) becomes the fallback where that event is unavailable.
 */
export function effectiveIdleTimeout(timeoutSeconds: number, screenOffSupported: boolean): number {
  return timeoutSeconds === 0 && !screenOffSupported ? IDLE_DIM_FALLBACK_TIMEOUT : timeoutSeconds;
}

/** Nearest offered idle time, for display only: the stored value is what gets saved. */
export function snapIdleTimeout(seconds: number): number {
  return IDLE_DIM_TIMEOUTS.reduce((best, option) => (
    Math.abs(option - seconds) < Math.abs(best - seconds) ? option : best
  ));
}

/** The service state, with the display-off timeout mapped where that event is unavailable. */
export function normalizeIdleDim(data: IdleDimState): IdleDimState {
  const screenOffSupported = data.screenOffSupported !== false;
  return {
    ...data,
    screenOffSupported,
    timeoutSeconds: effectiveIdleTimeout(data.timeoutSeconds, screenOffSupported),
    osScreenOffSeconds: data.osScreenOffSeconds ?? null,
  };
}
