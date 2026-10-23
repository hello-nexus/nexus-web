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

/** 1-based numbers of the pins sitting in the card's worst state. */
export function worstPins(card: AstralCard): string {
  return card.pins.flatMap((p, i) => (p.state === card.state ? [String(i + 1)] : [])).join(', ');
}

export type LevelStatus = 'none' | 'calibrating' | 'ready';

/** Calibrating is its own state: the readings are absent for a few seconds and that is not a missing sensor. */
export function levelStatus(card: AstralCard): LevelStatus {
  if (card.level.calibrating) return 'calibrating';
  return card.level.available ? 'ready' : 'none';
}

/** Translation key suffix for a tilt reading, `still` below the noise floor. */
export function tiltWord(value: number | undefined, plus: string, minus: string): string {
  if (value === undefined || Math.abs(value) < STILL_DEG) return 'still';
  return value > 0 ? plus : minus;
}

/** Signed degrees with a real minus sign. */
export function signedDegrees(v: number): string {
  if (Math.abs(v) < 0.005) return '0.00°';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}°`;
}

/** Whole seconds left on a countdown, never negative. */
export function secondsLeft(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
}

/** "0:42", "1:05" */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function withCurrent(times: readonly number[], current: number): number[] {
  return times.includes(current) ? [...times] : [...times, current].sort((a, b) => a - b);
}

/** Poll fast only while something is moving: a countdown, a calibration or a pin off normal. */
export function pollDelayMs(state: AstralState | null): number {
  const card = state?.cards[0];
  const busy = !!state?.countdown || !!card?.level.calibrating || (!!card && card.state !== 'ok');
  return busy ? 1000 : 5000;
}

export const finite = (v: number | undefined): number | undefined => (v !== undefined && Number.isFinite(v) ? v : undefined);
