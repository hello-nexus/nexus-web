// Pure helpers for the ROG Astral device page (Level Sense and the Power detector),
// following GPU Tweak III's own rules.

/**
 * A card that is not moving still reads a few hundredths of a degree either way
 * (up to about 0.08 on lean); below this the words say unchanged and no arrow end
 * lights up, while the number still shows the reading.
 */
export const STILL_DEG = 0.1;

/** Past this many degrees either way a reading shows as over the limit, as GPU Tweak III's default. */
export const WARN_DEG = 0.5;

/** How long the service takes to calibrate: five readings, one a second, plus a margin. */
export const CALIBRATE_MS = 6000;

/** The card's name without the brand its Devices icon already shows. */
export function astralCardName(name: string | undefined): string {
  return (name ?? '').replace(/^ASUS /, '') || 'ROG Astral';
}

/** Signed degrees with a real minus sign; noise that rounds to zero shows as 0.00°. */
export function signedDegrees(v: number): string {
  if (Math.abs(v) < 0.005) return '0.00°';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}°`;
}

/** -1, 0 or 1: which way a reading points once it is past the noise. */
export function tiltDirection(v: number): -1 | 0 | 1 {
  if (Math.abs(v) < STILL_DEG) return 0;
  return v > 0 ? 1 : -1;
}

export interface TiltWords {
  plusSlight: string;
  plus: string;
  minusSlight: string;
  minus: string;
}

/** The translation key for a reading: unchanged below the noise, the mild wording up to the limit, the firm one past it. */
export function tiltWordKey(value: number, limit: number, keys: TiltWords, unchanged: string): string {
  const size = Math.abs(value);
  if (size < STILL_DEG) return unchanged;
  if (value > 0) return size > limit ? keys.plus : keys.plusSlight;
  return size > limit ? keys.minus : keys.minusSlight;
}

export type PinState = 'green' | 'yellow' | 'red';

export interface PinLimits {
  pinLowAmps?: number;
  pinWarnAmps?: number;
  pinCautionAmps?: number;
}

/**
 * GPU Tweak III's rule for its pin dots (CMainDlg::OnTimer in GPUTweakIII.exe): each
 * pin on its own, never against the others. Fine from pinLowAmps up to under
 * pinWarnAmps (9.2 A, 17 A with the ROG Equalizer), otherwise red, a pin carrying
 * nothing included. GPU Tweak never shows its yellow dot; here a pin from
 * pinCautionAmps (8.5 A) carries clearly more than its share and shows it in yellow.
 */
export function pinState(amps: number, limits: PinLimits): PinState {
  if (amps < (limits.pinLowAmps ?? 0.01) || amps >= (limits.pinWarnAmps || 9.2)) return 'red';
  return amps >= (limits.pinCautionAmps || 8.5) ? 'yellow' : 'green';
}

/** The connector as a whole: red once any pin is red, yellow while one is yellow. */
export function connectorState(states: readonly PinState[]): PinState {
  if (states.includes('red')) return 'red';
  return states.includes('yellow') ? 'yellow' : 'green';
}

/** A finite number of amps, 0 otherwise. */
export function amps(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** "12.4 A" */
export function ampsText(v: unknown): string {
  return `${amps(v).toFixed(1)} A`;
}

/** A limit as GPU Tweak writes it: "12.5", "17". */
export function limitText(v: unknown): string {
  return `${Number(amps(v).toFixed(1))}`;
}

/** Time left on a countdown: "0:42", "1:05". */
export function clockLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The offered times in seconds, with the saved one added when it is not among them. */
export function withCurrentTime(times: readonly number[], current: number): number[] {
  return times.includes(current) ? [...times] : [...times, current].sort((a, b) => a - b);
}

export interface StageExtent {
  /** Where the drawing sits in its view box, in view units. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Half the side of the square view box, centred on the pivot. */
  half: number;
  pivot: readonly [number, number];
}

/**
 * The square box (its side as a fraction of the stage height) and its centre
 * (fractions of the stage) that fit a drawing in a stage of the given aspect, its
 * content centred, with the pivot at the box centre so the card turns about it.
 */
export function fitStage(extent: StageExtent, aspect: number): { size: number; x: number; y: number } {
  const span = 2 * extent.half;
  const w = extent.x1 - extent.x0;
  const h = extent.y1 - extent.y0;
  const size = Math.min((0.9 * aspect * span) / w, (0.86 * span) / h);
  const px = size / span;
  const cx = (extent.x0 + extent.x1) / 2 - extent.pivot[0];
  const cy = (extent.y0 + extent.y1) / 2 - extent.pivot[1];
  return { size, x: 0.5 - (cx * px) / aspect, y: 0.5 - cy * px };
}
