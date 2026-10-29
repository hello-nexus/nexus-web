import type { AstralCard, AstralPinState, AstralState } from '../../../api/astral';

/** Readings below this many degrees either way count as unchanged. */
export const STILL_DEG = 0.1;

/** Limits the service applies, shown in the auto-shutdown hints. */
export const LIMITS = {
  overcurrent: { normal: 12.5, equalizer: 18 },
  critical: { normal: 17, equalizer: 20 },
} as const;

/** The countdown seconds offered, the saved one added when it is not among them. */
export const TIME_CHOICES = [10, 30, 60, 120, 300] as const;

export const sensorId = (gpuId: string, leaf: string) => `${gpuId}/astral/${leaf}`;

export type NoticeTone = 'warning' | 'critical';

/** A card at rest says nothing; caution and warning are a heads-up, the rest are faults. */
export function alertTone(state: AstralPinState): NoticeTone | null {
  if (state === 'ok') return null;
  return state === 'caution' || state === 'warning' ? 'warning' : 'critical';
}

/** Worst first: the card's own state leads, the rest follow in this order. */
const STATE_ORDER: readonly AstralPinState[] = ['critical', 'overcurrent', 'dead', 'warning', 'caution'];

export interface PinGroup {
  state: AstralPinState;
  /** 1-based pin numbers, joined for display. */
  pins: string;
  count: number;
}

/** Every pin off normal, grouped by state, the card's worst state first. */
export function pinGroups(card: AstralCard): PinGroup[] {
  const rank = (s: AstralPinState) => (s === card.state ? -1 : STATE_ORDER.indexOf(s));
  const byState = new Map<AstralPinState, string[]>();
  card.pins.forEach((p, i) => {
    if (p.state === 'ok') return;
    byState.set(p.state, [...(byState.get(p.state) ?? []), String(i + 1)]);
  });
  return [...byState.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([state, nums]) => ({ state, pins: nums.join(', '), count: nums.length }));
}

export type LevelStatus = 'none' | 'calibrating' | 'ready';

/** Calibrating is its own state: the readings are absent for a few seconds and that is not a missing sensor. */
export function levelStatus(card: AstralCard): LevelStatus {
  if (card.level.calibrating) return 'calibrating';
  return card.level.available ? 'ready' : 'none';
}

/** Past this many degrees either way a reading is over the limit. */
export const WARN_DEG = 0.5;

/** -1, 0 or 1: which way a reading points once it is past the noise. */
export function tiltDirection(v: number | undefined): -1 | 0 | 1 {
  if (v === undefined || Math.abs(v) < STILL_DEG) return 0;
  return v > 0 ? 1 : -1;
}

/** Translation key suffix for a tilt reading: unchanged below the noise, mild up to the limit, firm past it; empty without a reading. */
export function tiltWord(value: number | undefined, plus: string, minus: string): string {
  if (value === undefined) return '';
  const dir = tiltDirection(value);
  if (dir === 0) return 'unchanged';
  return `${dir > 0 ? plus : minus}${Math.abs(value) > WARN_DEG ? '' : 'Slight'}`;
}

export type PinTone = 'green' | 'yellow' | 'red';

/** The connector drawing has three tones: caution and warning are yellow, any fault is red. */
export function pinTone(state: AstralPinState): PinTone {
  if (state === 'ok') return 'green';
  return state === 'caution' || state === 'warning' ? 'yellow' : 'red';
}

/** The connector as a whole: red once any pin is red, yellow while one is yellow. */
export function connectorTone(tones: readonly PinTone[]): PinTone {
  if (tones.includes('red')) return 'red';
  return tones.includes('yellow') ? 'yellow' : 'green';
}

export interface StageExtent {
  /** Where the drawing sits in its view box, in view units. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Half the side of the square view box, centered on the pivot. */
  half: number;
  pivot: readonly [number, number];
}

/**
 * The square box (its side as a fraction of the stage height) and its center
 * (fractions of the stage) that fit a drawing in a stage of the given aspect, its
 * content centered, with the pivot at the box center so the card turns about it.
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

/** Signed degrees with an ASCII minus. */
export function signedDegrees(v: number): string {
  if (Math.abs(v) < 0.005) return '0.00°';
  return `${v > 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}°`;
}

/** Whole seconds left on a countdown given the service's remaining time and how long ago it was received, never negative. */
export function secondsLeft(remainingMs: number, elapsedMs: number): number {
  return Math.max(0, Math.ceil((remainingMs - Math.max(0, elapsedMs)) / 1000));
}

/** Minutes and zero-padded seconds. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function withCurrent(times: readonly number[], current: number): number[] {
  return times.includes(current) ? [...times] : [...times, current].sort((a, b) => a - b);
}

export const SLOW_POLL_MS = 5000;
export const FAST_POLL_MS = 1000;

/** How long a calibration takes, in seconds. */
export const CALIBRATE_SECONDS = 5;

/** The seconds the service waits after a critical reading before shutting down. */
export const CRITICAL_SECONDS = 10;

/** Poll fast while something is moving (a countdown, a calibration, a pin off normal) or the pin readout is on screen. */
export function pollDelayMs(state: AstralState | null, readoutVisible = false): number {
  const busy = readoutVisible || !!state?.countdown || !!state?.cards.some(c => c.level.calibrating || c.state !== 'ok');
  return busy ? FAST_POLL_MS : SLOW_POLL_MS;
}

export const finite = (v: number | undefined): number | undefined => (v !== undefined && Number.isFinite(v) ? v : undefined);

/** Screen size of one view unit in a stage, up to the stage width: the same number for two views means the same drawn size. */
export function unitScale(extent: StageExtent, aspect: number): number {
  return fitStage(extent, aspect).size / (2 * extent.half);
}

/** A request that has not answered by then counts as failed. */
export const REQUEST_TIMEOUT_MS = 8000;

/** Writes wait longer than the relay and direct-channel transports' own request timeout, so a failure is never reported for a write that can still land. */
export const WRITE_TIMEOUT_MS = 25000;

/** Failed polls in a row before the load notice shows over a page that has loaded. */
export const POLL_FAILS_BEFORE_NOTICE = 3;

/** Runs a request with its own abort signal, linked to `parent`; resolves null on a throw, a timeout or an abort, whatever the transport does with the signal. */
export function withTimeout<T>(
  send: (signal: AbortSignal) => Promise<T | null>,
  parent?: AbortSignal,
  ms = REQUEST_TIMEOUT_MS,
): Promise<T | null> {
  const ctl = new AbortController();
  const abort = () => ctl.abort();
  if (parent?.aborted) ctl.abort();
  parent?.addEventListener('abort', abort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = new Promise<null>(resolve => {
    timer = setTimeout(() => { ctl.abort(); resolve(null); }, ms);
    ctl.signal.addEventListener('abort', () => resolve(null));
  });
  const request = ctl.signal.aborted ? Promise.resolve(null) : Promise.resolve().then(() => send(ctl.signal)).catch(() => null);
  return Promise.race([request, stop]).finally(() => {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
  });
}
