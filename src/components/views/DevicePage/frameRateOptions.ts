import { RATE_CAP_OPTIONS_HZ } from '../../../panel/widgets/lighting/page/RateCapSelect';

/** Select value of "no cap": the device runs at its own rate. */
export const FRAME_RATE_OFF = '';

/** Options of the per-device Frame rate select: Off, then the same caps the lighting frame cap offers. */
export function frameRateCaps(storedCap: number | null | undefined): Array<number | null> {
  const caps: number[] = [...RATE_CAP_OPTIONS_HZ];
  // A stored cap outside the presets stays listed so the select shows what is applied.
  if (typeof storedCap === 'number' && storedCap >= 1 && !caps.includes(storedCap)) {
    caps.push(storedCap);
    caps.sort((a, b) => b - a);
  }
  return [null, ...caps];
}

/** The select value for a stored cap. */
export function frameRateValue(storedCap: number | null | undefined): string {
  return typeof storedCap === 'number' && storedCap >= 1 ? String(storedCap) : FRAME_RATE_OFF;
}

/** The cap to send for a select value; 0 clears the stored cap. */
export function frameRateFromValue(value: string): number {
  const fps = Number(value);
  return Number.isFinite(fps) && fps >= 1 ? fps : 0;
}

/** Whether a panel offers the Frame rate setting: every streamed display and every display-bound kiosk panel, never a simulator. */
export function showsFrameRateSetting(streamed: boolean, displayBound: boolean, simulated: boolean): boolean {
  return !simulated && (streamed || displayBound);
}
