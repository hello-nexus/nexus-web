import { describe, expect, it, vi } from 'vitest';
import type { AstralCard, AstralState } from '../../../api/astral';
import {
  alertTone, clock, connectorTone, fitStage, levelStatus, pinTone, pollDelayMs, withTimeout, secondsLeft, signedDegrees, tiltWord, unitScale, withCurrent, pinGroups,
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

describe('pinGroups', () => {
  const withStates = (states: Record<number, AstralCard['state']>, state: AstralCard['state']) =>
    card({ state, pins: card().pins.map((p, i) => (states[i] ? { ...p, state: states[i] } : p)) });
  it('is empty at rest', () => {
    expect(pinGroups(card())).toEqual([]);
  });
  it('groups pins by state, 1-based, with a count', () => {
    expect(pinGroups(withStates({ 1: 'overcurrent', 4: 'overcurrent' }, 'overcurrent')))
      .toEqual([{ state: 'overcurrent', pins: '2, 5', count: 2 }]);
  });
  it('names every non-ok pin, the card state first', () => {
    const groups = pinGroups(withStates({ 0: 'caution', 2: 'critical', 3: 'warning', 5: 'dead' }, 'critical'));
    expect(groups.map(g => [g.state, g.pins])).toEqual([['critical', '3'], ['dead', '6'], ['warning', '4'], ['caution', '1']]);
  });
});

describe('levelStatus', () => {
  it('calibrating wins over a card that has no readings yet', () => {
    expect(levelStatus(card({ level: { available: false, calibrating: true } }))).toBe('calibrating');
  });
  it('reports no sensor only when neither available nor calibrating', () => {
    expect(levelStatus(card({ level: { available: false, calibrating: false } }))).toBe('none');
    expect(levelStatus(card())).toBe('ready');
  });
});

describe('tiltWord', () => {
  it('is unchanged under the noise floor and empty without a reading', () => {
    expect(tiltWord(0.05, 'down', 'up')).toBe('unchanged');
    expect(tiltWord(undefined, 'down', 'up')).toBe('');
  });
  it('is mild up to the limit and firm past it, by sign', () => {
    expect(tiltWord(0.3, 'down', 'up')).toBe('downSlight');
    expect(tiltWord(-0.3, 'down', 'up')).toBe('upSlight');
    expect(tiltWord(0.9, 'down', 'up')).toBe('down');
    expect(tiltWord(-0.9, 'down', 'up')).toBe('up');
  });
});

describe('pin tones', () => {
  it('maps states to the three drawing tones', () => {
    expect(pinTone('ok')).toBe('green');
    expect(pinTone('warning')).toBe('yellow');
    expect(pinTone('dead')).toBe('red');
    expect(connectorTone(['green', 'yellow'])).toBe('yellow');
    expect(connectorTone(['yellow', 'red'])).toBe('red');
  });
});

describe('unitScale', () => {
  it('is the stage fit per view unit', () => {
    const ext = { x0: 0, x1: 100, y0: 0, y1: 100, half: 100, pivot: [50, 50] as const };
    expect(unitScale(ext, 2)).toBeCloseTo(fitStage(ext, 2).size / 200);
  });
});

describe('fitStage', () => {
  it('centers the drawing in the stage', () => {
    const fit = fitStage({ x0: 0, x1: 100, y0: 0, y1: 100, half: 100, pivot: [50, 50] }, 2);
    expect(fit.x).toBeCloseTo(0.5);
    expect(fit.y).toBeCloseTo(0.5);
  });
});

describe('formatting', () => {
  it('signs degrees with a real minus', () => {
    expect(signedDegrees(0.18)).toBe('+0.18°');
    expect(signedDegrees(-0.62)).toBe('-0.62°');
    expect(signedDegrees(0.001)).toBe('0.00°');
  });
  it('counts down without going negative', () => {
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(9_000, 10_000)).toBe(0);
    expect(secondsLeft(5_000, -300)).toBe(5);
    expect(clock(65)).toBe('1:05');
  });
  it('adds a saved time that is not among the choices, in order', () => {
    expect(withCurrent([10, 30, 60], 45)).toEqual([10, 30, 45, 60]);
    expect(withCurrent([10, 30, 60], 30)).toEqual([10, 30, 60]);
  });
});

describe('pollDelayMs', () => {
  const state = (c: AstralCard, countdown?: AstralState['countdown']): AstralState => ({
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
    expect(pollDelayMs(state(card(), { reason: 'overcurrent', endsAtMs: 1, remainingMs: 1, gpuId: 'gpu0' }))).toBe(1000);
    expect(pollDelayMs(state(card({ level: { available: false, calibrating: true } })))).toBe(1000);
    expect(pollDelayMs(state(card({ state: 'caution' })))).toBe(1000);
  });
  it('is fast while the pin readout is on screen', () => {
    expect(pollDelayMs(state(card()), true)).toBe(1000);
    expect(pollDelayMs(null, true)).toBe(1000);
  });
  it('looks at every card', () => {
    const s = state(card());
    s.cards.push(card({ state: 'dead' }));
    expect(pollDelayMs(s)).toBe(1000);
  });
});

describe('withTimeout', () => {
  it('passes a reply through and resolves null on a throw', async () => {
    expect(await withTimeout(async () => 5)).toBe(5);
    expect(await withTimeout(async () => { throw new Error('x'); })).toBeNull();
  });
  it('resolves null and aborts the request once the time is up', async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const p = withTimeout(signal => { seen = signal; return new Promise<number>(() => {}); }, undefined, 100);
    await vi.advanceTimersByTimeAsync(101);
    vi.useRealTimers();
    expect(await p).toBeNull();
    expect(seen?.aborted).toBe(true);
  });
  it('aborts with its parent', async () => {
    const parent = new AbortController();
    let seen: AbortSignal | undefined;
    const p = withTimeout(signal => { seen = signal; return new Promise<number>(() => {}); }, parent.signal);
    parent.abort();
    expect(await p).toBeNull();
    expect(seen?.aborted).toBe(true);
  });
});
