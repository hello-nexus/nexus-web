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

/** Nearest offered idle time, so an off-list stored value still shows a selection. */
function snapToTimeout(seconds: number): number {
  return IDLE_DIM_TIMEOUTS.reduce((best, option) => (
    Math.abs(option - seconds) < Math.abs(best - seconds) ? option : best
  ));
}

/** The service state with its timeout mapped onto an offered option. */
export function normalizeIdleDim(data: IdleDimState): IdleDimState {
  const screenOffSupported = data.screenOffSupported !== false;
  return {
    ...data,
    screenOffSupported,
    timeoutSeconds: (() => {
      const effective = effectiveIdleTimeout(data.timeoutSeconds, screenOffSupported);
      return effective === 0 ? 0 : snapToTimeout(effective);
    })(),
    osScreenOffSeconds: data.osScreenOffSeconds ?? null,
  };
}
