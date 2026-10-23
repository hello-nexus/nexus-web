import { describe, expect, it } from 'vitest';
import type { AstralCard, AstralState } from '../../../api/astral';
import {
  alertTone, clock, levelStatus, pollDelayMs, secondsLeft, signedDegrees, tiltWord, withCurrent, worstPins,
} from './astralUtils';

const card = (over: Partial<AstralCard> = {}): AstralCard => ({
  gpuId: 'gpu0',
  name: 'ROG Astral',
  level: { available: true, calibrating: false, calibratedAtMs: 1 },
  pins: [1, 2, 3, 4, 5, 6].map(() => ({ amps: 7, state: 'ok' as const })),
  state: 'ok',
  ...over,
});

describe('alertTone', () => {
  it.each([
    ['ok', null],
    ['caution', 'warning'],
    ['warning', 'warning'],
    ['overcurrent', 'critical'],
    ['critical', 'critical'],
    ['dead', 'critical'],
  ] as const)('%s maps to %s', (state, tone) => {
    expect(alertTone(state)).toBe(tone);
  });
});

describe('worstPins', () => {
  it('lists only the pins in the card state, 1-based', () => {
    const pins = card().pins.map((p, i) => (i === 1 || i === 4 ? { ...p, state: 'overcurrent' as const } : p));
    expect(worstPins(card({ pins, state: 'overcurrent' }))).toBe('2, 5');
  });
});

describe('levelStatus', () => {
  it('calibrating wins over a card that has no readings yet', () => {
    expect(levelStatus(card({ level: { available: false, calibrating: true, calibratedAtMs: null } }))).toBe('calibrating');
  });
  it('reports no sensor only when neither available nor calibrating', () => {
    expect(levelStatus(card({ level: { available: false, calibrating: false, calibratedAtMs: null } }))).toBe('none');
    expect(levelStatus(card())).toBe('ready');
  });
});

describe('tiltWord', () => {
  it('is still under the noise floor or without a reading', () => {
    expect(tiltWord(0.05, 'down', 'up')).toBe('still');
    expect(tiltWord(undefined, 'down', 'up')).toBe('still');
  });
  it('follows the sign past it', () => {
    expect(tiltWord(0.3, 'down', 'up')).toBe('down');
    expect(tiltWord(-0.3, 'down', 'up')).toBe('up');
  });
});

describe('formatting', () => {
  it('signs degrees with a real minus', () => {
    expect(signedDegrees(0.18)).toBe('+0.18°');
    expect(signedDegrees(-0.62)).toBe('−0.62°');
    expect(signedDegrees(0.001)).toBe('0.00°');
  });
  it('counts down without going negative', () => {
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(9_000, 10_000)).toBe(0);
    expect(clock(65)).toBe('1:05');
  });
  it('adds a saved time that is not among the choices, in order', () => {
    expect(withCurrent([10, 30, 60], 45)).toEqual([10, 30, 45, 60]);
    expect(withCurrent([10, 30, 60], 30)).toEqual([10, 30, 60]);
  });
});

describe('pollDelayMs', () => {
  const state = (c: AstralCard, countdown: AstralState['countdown'] = null): AstralState => ({
    supported: true,
    cards: [c],
    settings: { alerts: true, equalizer: false, overcurrentShutdown: false, overcurrentSeconds: 60, countdownSeconds: 60, criticalShutdown: false },
    countdown,
    heldOff: false,
    simulated: false,
  });
  it('is slow at rest and fast for a countdown, a calibration or a fault', () => {
    expect(pollDelayMs(null)).toBe(5000);
    expect(pollDelayMs(state(card()))).toBe(5000);
    expect(pollDelayMs(state(card(), { reason: 'overcurrent', endsAtMs: 1 }))).toBe(1000);
    expect(pollDelayMs(state(card({ level: { available: false, calibrating: true, calibratedAtMs: null } })))).toBe(1000);
    expect(pollDelayMs(state(card({ state: 'caution' })))).toBe(1000);
  });
});
