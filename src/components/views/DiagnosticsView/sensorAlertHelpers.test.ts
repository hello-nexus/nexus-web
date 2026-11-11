import { describe, expect, it } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import {
  baseBounds, chipState, defaultHigh, defaultRule, displayBounds, formatAlertValue, fromDisplay, ALERT_SENSOR_CATEGORIES, delayChoices, delayLabel, rowState, seedBound, sensorLabel, stateColor, snapDisplay, toDisplay, widenBounds,
} from './sensorAlertHelpers';

const rule = (over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id: 'r1', enabled: true,
  sensor: { category: 'cpu', id: 'cpu/temp/0', name: 'CPU Package', type: 'Temperature', parentName: 'CPU' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, showInHealth: true, repeatMinutes: 0, ...over,
});

const state = (over: Partial<SensorAlertState> = {}): SensorAlertState => ({
  ruleId: 'r1', state: 'active', value: 85, since: null, extreme: 86, direction: 'above', acknowledged: false, ...over,
});

describe('temperature unit conversion', () => {
  it('shows Celsius unchanged and Fahrenheit converted', () => {
    expect(toDisplay(80, 'Temperature', 'c')).toBe(80);
    expect(toDisplay(80, 'Temperature', 'f')).toBe(176);
    expect(toDisplay(37.5, 'Temperature', 'f')).toBe(99.5);
  });

  it('stores Fahrenheit input as Celsius rounded to 0.1', () => {
    expect(fromDisplay(176, 'Temperature', 'f')).toBe(80);
    expect(fromDisplay(100, 'Temperature', 'f')).toBe(37.8);
    expect(fromDisplay(75.5, 'Temperature', 'c')).toBe(75.5);
  });

  it('leaves other sensor types untouched in either unit', () => {
    expect(toDisplay(9.5, 'Current', 'f')).toBe(9.5);
    expect(fromDisplay(9.5, 'Current', 'f')).toBe(9.5);
  });

  it('formats with the unit of the type', () => {
    expect(formatAlertValue(80, 'Temperature', 'f', 'dot')).toBe('176°F');
    expect(formatAlertValue(9.5, 'Current', 'c', 'dot')).toBe('9.5 A');
    expect(formatAlertValue(1200, 'Fan', 'c', 'dot')).toBe('1,200 RPM');
    expect(formatAlertValue(40, 'Load', 'c', 'dot')).toBe('40%');
  });
});

describe('slider bounds per type', () => {
  it('uses the fixed ranges for temperature and percent types', () => {
    expect(baseBounds('Temperature', 50, null, 80)).toEqual({ min: 0, max: 120 });
    for (const type of ['Load', 'Control', 'Level']) expect(baseBounds(type, 50, null, 80)).toEqual({ min: 0, max: 100 });
  });

  it('scales Current, Power and Fan with the observed value', () => {
    expect(baseBounds('Current', 3, null, 5)).toEqual({ min: 0, max: 15 });
    expect(baseBounds('Current', 10, null, 12)).toEqual({ min: 0, max: 20 });
    expect(baseBounds('Power', 50, null, 80)).toEqual({ min: 0, max: 100 });
    expect(baseBounds('Power', 200, null, 250).max).toBe(300);
    expect(baseBounds('Fan', 1000, null, 3000)).toEqual({ min: 0, max: 5000 });
    expect(baseBounds('Fan', 6000, null, 7000).max).toBeCloseTo(7200);
  });

  it('centers voltage on the reading with 25 percent each way', () => {
    const b = baseBounds('Voltage', 12, null, 13);
    expect(b.min).toBeCloseTo(9);
    expect(b.max).toBeCloseTo(15);
  });

  it('widens to include a limit typed beyond the range, and never shrinks', () => {
    expect(baseBounds('Temperature', 50, null, 150)).toEqual({ min: 0, max: 150 });
    expect(widenBounds({ min: 0, max: 120 }, [null, 130, -5])).toEqual({ min: -5, max: 130 });
    expect(widenBounds({ min: 0, max: 120 }, [40])).toEqual({ min: 0, max: 120 });
  });

  it('snaps display bounds outward to the step in the displayed unit', () => {
    expect(displayBounds({ min: 0, max: 120 }, 'Temperature', 'f')).toEqual({ min: 32, max: 248 });
    expect(displayBounds({ min: 0, max: 15.04 }, 'Current', 'c')).toEqual({ min: 0, max: 15.1 });
  });
});

describe('new rule defaults', () => {
  it('seeds the upper limit at the reading times 1.2, rounded, with the lower limit off', () => {
    expect(defaultHigh('Temperature', 62)).toBe(74);
    expect(defaultHigh('Current', 8.4)).toBe(10.1);
    const r = defaultRule(rule().sensor, 62);
    expect(r.high).toBe(74);
    expect(r.low).toBeNull();
    expect(r).toMatchObject({ enabled: true, severity: 'watch', repeatMinutes: 0, raiseAfterSeconds: 5, clearAfterSeconds: 5 });
  });

  it('falls back to a type default without a usable reading', () => {
    expect(defaultHigh('Temperature', null)).toBe(80);
    expect(defaultHigh('Load', 0)).toBe(90);
  });

  it('seeds a re-enabled side clear of the other limit', () => {
    const bounds = { min: 0, max: 120 };
    expect(seedBound('low', 'Temperature', 50, bounds, 45)).toBeLessThan(45);
    expect(seedBound('high', 'Temperature', 50, bounds, 70)).toBeGreaterThan(70);
  });

  it('never seeds a limit onto the other one at the track edge, so the rule stays valid', () => {
    const bounds = { min: 0, max: 120 };
    const low = seedBound('low', 'Temperature', 0, bounds, 1);
    expect(low).toBeLessThan(1);
    const high = seedBound('high', 'Temperature', 200, bounds, 119);
    expect(high).toBeGreaterThan(119);
  });
});

describe('alert state helpers', () => {
  it('shows no chip for a disabled rule and the service state otherwise', () => {
    expect(chipState(rule({ enabled: false }), state())).toBeNull();
    expect(chipState(rule(), state({ state: 'pending' }))).toBe('pending');
    expect(chipState(rule(), undefined)).toBe('ok');
  });

  it('shows a disabled rule as disabled, whatever the service state', () => {
    expect(rowState(rule({ enabled: false }), state())).toBe('disabled');
    expect(rowState(rule(), state({ state: 'unavailable' }))).toBe('unavailable');
    expect(rowState(rule(), undefined)).toBe('ok');
  });

  it('colors ok good, pending warn, active by severity and the rest muted', () => {
    expect(stateColor('ok', rule())).toBe('var(--good)');
    expect(stateColor('pending', rule({ severity: 'act' }))).toBe('var(--warn)');
    expect(stateColor('active', rule())).toBe('var(--warn)');
    expect(stateColor('active', rule({ severity: 'act' }))).toBe('var(--bad)');
    expect(stateColor('unavailable', rule())).toBe('var(--text-dim)');
    expect(stateColor('disabled', rule())).toBe('var(--text-dim)');
  });
});

describe('display helpers', () => {
  it('snaps a converted Fahrenheit value to the slider step', () => {
    expect(snapDisplay(toDisplay(37.5, 'Temperature', 'f'), 'Temperature')).toBe(100);
    expect(snapDisplay(9.54, 'Current')).toBe(9.5);
  });

  it('drops decimals for whole-number types when asked, and keeps them for the rest', () => {
    expect(formatAlertValue(62.4, 'Temperature', 'c', 'dot', true)).toBe('62°C');
    expect(formatAlertValue(62.4, 'Temperature', 'c', 'dot', false)).toBe('62.4°C');
    expect(formatAlertValue(9.5, 'Current', 'c', 'dot', true)).toBe('9.5 A');
  });

  it('labels a sensor with its parent unless the name already carries it', () => {
    expect(sensorLabel({ ...rule().sensor, name: 'Pin 3 Current', parentName: 'PSU' })).toBe('PSU Pin 3 Current');
    expect(sensorLabel(rule().sensor)).toBe('CPU Package');
  });
});

describe('alert sensor categories', () => {
  it('offers the SMART category so drive temperatures can be picked, right after storage', () => {
    const list = ALERT_SENSOR_CATEGORIES as readonly string[];
    expect(list.indexOf('smart')).toBe(list.indexOf('storage') + 1);
  });
});

describe('delay choices', () => {
  const t = (k: string, v?: Record<string, string | number>) => `${k}:${v ? Object.values(v).join(',') : ''}`;

  it('offers Instantly then the shared slideshow intervals up to the service limit, and adds a stored off-list value in place', () => {
    expect(delayChoices(5)).toEqual([0, 5, 10, 15, 30, 60, 180, 300]);
    expect(delayChoices(7)).toEqual([0, 5, 7, 10, 15, 30, 60, 180, 300]);
    expect(delayChoices(600)).toEqual([0, 5, 10, 15, 30, 60, 180, 300, 600]);
  });

  it('words zero as instantly and the rest with the slideshow wording', () => {
    expect(delayLabel(t, 'en', 0)).toBe('diagnostics.alerts.delay.instant:');
    expect(delayLabel(t, 'en', 30)).toContain('slideshow.seconds');
    expect(delayLabel(t, 'en', 180)).toContain('slideshow.minutes');
    expect(delayLabel(t, 'en', 90)).toContain('slideshow.seconds');
  });
});
