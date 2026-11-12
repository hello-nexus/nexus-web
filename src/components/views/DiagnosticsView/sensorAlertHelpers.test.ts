import { describe, expect, it } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import {
  baseBounds, chipState, defaultHigh, defaultRule, displayBounds, formatAlertValue, formatDisplayValue, fromDisplay, ALERT_SENSOR_CATEGORIES, delayChoices, delayLabel, rowState, seedBound, alertBannerText, isBannerAlert, sensorLabel, stateColor, snapDisplay, toDisplay, widenBounds, padBounds, stateLabelKey, ruleLabel, findTrackedRule, rowTitles,
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

  it('formats a display-unit value without converting it again', () => {
    expect(formatDisplayValue(175, 'Temperature', 'f', 'dot')).toBe('175°F');
    expect(formatDisplayValue(80, 'Temperature', 'c', 'dot')).toBe('80°C');
    expect(formatDisplayValue(9.5, 'Current', 'f', 'dot')).toBe('9.5 A');
  });
});

describe('slider bounds per type', () => {
  it('uses the fixed ranges for temperature and percent types', () => {
    expect(baseBounds('Temperature', 50, null, 80)).toEqual({ min: 20, max: 100 });
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
    expect(baseBounds('Temperature', 50, null, 150)).toEqual({ min: 20, max: 150 });
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

describe('active alert banner', () => {
  const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`;
  const prefs = { monitoringTempUnit: 'c' as const, numberFormat: 'dot' as const, monitoringWholeNumbers: false, timeFormat: '24h' as const, dateFormat: 'system' as const };
  const now = new Date('2026-11-10T23:30:00').getTime();
  const current = rule({ sensor: { category: 'psu', id: 'p', name: 'PSU Output', type: 'Current', parentName: 'PSU' }, high: 9.5 });

  it('names the sensor, limit, local start time and peak in the user units', () => {
    const { title, detail } = alertBannerText(t, current, state({ since: '2026-11-10T21:09:00', value: 10, extreme: 10.1 }), prefs, 'en', now);
    expect(title).toBe('diagnostics.alerts.banner.above{"name":"PSU Output","limit":"9.5 A","time":"21:09","peak":"10.1 A"}');
    expect(detail).toBe('diagnostics.alerts.banner.detail{"value":"10 A"}');
  });

  it('shows the date as well for a start on an earlier day', () => {
    const { title } = alertBannerText(t, current, state({ since: '2026-11-08T21:09:00', value: 10, extreme: 10.1 }), prefs, 'en', now);
    expect(title).toContain('"time":"Nov 8, 21:09"');
  });

  it('converts a temperature to Fahrenheit and uses the lower limit and text for a low alert', () => {
    const low = rule({ low: 20, high: null });
    const { title } = alertBannerText(t, low, state({ direction: 'below', since: '2026-11-10T21:09:00', value: 15, extreme: 10 }), { ...prefs, monitoringTempUnit: 'f' }, 'en', now);
    expect(title).toBe('diagnostics.alerts.banner.below{"name":"CPU Package","limit":"68°F","time":"21:09","peak":"50°F"}');
  });

  it('falls back to a dash for a missing start time', () => {
    const { title } = alertBannerText(t, current, state({ since: null }), prefs, 'en', now);
    expect(title).toContain('"time":"-"');
  });

  it('banners only an enabled, active, unacknowledged rule', () => {
    expect(isBannerAlert(rule(), state())).toBe(true);
    expect(isBannerAlert(rule({ enabled: false }), state())).toBe(false);
    expect(isBannerAlert(rule(), state({ acknowledged: true }))).toBe(false);
    expect(isBannerAlert(rule(), state({ state: 'pending' }))).toBe(false);
    expect(isBannerAlert(rule(), undefined)).toBe(false);
  });
});

describe('padBounds', () => {
  it('grows an end by a step only when a set limit sits on it', () => {
    expect(padBounds({ min: 0, max: 120 }, null, 120, 1)).toEqual({ min: 0, max: 121 });
    expect(padBounds({ min: 0, max: 120 }, 0, 80, 1)).toEqual({ min: -1, max: 120 });
    expect(padBounds({ min: 0, max: 120 }, 10, 80, 1)).toEqual({ min: 0, max: 120 });
    expect(padBounds({ min: 0, max: 1 }, null, 1, 0.05)).toEqual({ min: 0, max: 1.05 });
  });
});

describe('stateLabelKey', () => {
  it('words an unavailable sensor as not reported, never as a fault', () => {
    expect(stateLabelKey('unavailable')).toBe('diagnostics.sensors.notReported');
    expect(stateLabelKey('ok')).toBe('diagnostics.alerts.state.ok');
  });
});

describe('ruleLabel', () => {
  it('names a built-in by its device name and a user rule by its sensor label', () => {
    const builtIn = rule({ builtIn: 'gpuTemp', sensor: { category: 'builtin', id: 'gpu-temp:gpu-0', name: 'GPU Alpha', type: 'Temperature', parentName: '' } });
    expect(ruleLabel(builtIn)).toBe('GPU Alpha');
    expect(ruleLabel(rule())).toBe('CPU Package');
  });
});

describe('findTrackedRule and rowTitles', () => {
  const mk = (id: string, sensor: Partial<SensorAlertRule['sensor']>, builtIn: SensorAlertRule['builtIn'] = null, source?: SensorAlertRule['source']): SensorAlertRule => ({
    id, enabled: true, sensor: { category: 'cpu', id: 'cpu/temp/0', name: 'Package', type: 'Temperature', parentName: 'CPU', ...sensor },
    low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch', notifyDesktop: false, showInHealth: true, repeatMinutes: 0, builtIn, source,
  });
  const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}(${vars.count})` : key);
  const pkg = { category: 'cpu', id: 'cpu/temp/0', name: 'Package', type: 'Temperature', parentName: 'CPU' };

  it('finds the entry tracking a sensor, comparing a built-in by its source sensor and ignoring the entry being edited', () => {
    const a = mk('a', { id: 'x' });
    const cpu = mk('builtin:cpu-temp', { category: 'builtin', id: 'cpu-temp', parentName: '' }, 'cpuTemp', { kind: 'sensor', sensor: pkg, sensors: [], hardwareName: 'CPU' });
    const drive = mk('builtin:drive-temp:d', { category: 'builtin', id: 'drive-temp:d', parentName: '' }, 'storageTemp', { kind: 'drive', sensor: null, sensors: [], hardwareName: 'D' });
    expect(findTrackedRule([a, cpu, drive], pkg)).toBe(cpu);
    expect(findTrackedRule([cpu], pkg, 'builtin:cpu-temp')).toBeUndefined();
    expect(findTrackedRule([a], a.sensor)).toBe(a);
    expect(findTrackedRule([drive, mk('b', { id: 'y' })], { ...pkg, id: 'other' })).toBeUndefined();
    expect(findTrackedRule([a], { ...a.sensor, type: 'Fan' })).toBeUndefined();
  });

  it('titles every entry as device then exact sensor', () => {
    expect(rowTitles(mk('a', {}), t)).toEqual({ title: 'CPU', subtitle: 'Package' });
    expect(rowTitles(mk('b', { parentName: '' }), t)).toEqual({ title: 'Package', subtitle: undefined });
    const builtIn = (source?: SensorAlertRule['source']) => mk('builtin:x', { category: 'builtin', name: 'AMD Ryzen', parentName: '' }, 'cpuTemp', source);
    expect(rowTitles(builtIn(), t)).toEqual({ title: 'AMD Ryzen', subtitle: undefined });
    expect(rowTitles(builtIn({ kind: 'sensor', sensor: pkg, sensors: [], hardwareName: 'CPU' }), t).subtitle).toBe('Package');
    expect(rowTitles(builtIn({ kind: 'average', sensor: null, sensors: [pkg, pkg], hardwareName: 'Memory' }), t).subtitle).toBe('diagnostics.sensors.source.average(2)');
    expect(rowTitles(builtIn({ kind: 'drive', sensor: null, sensors: [], hardwareName: 'D' }), t).subtitle).toBe('diagnostics.sensors.source.drive');
  });
});
