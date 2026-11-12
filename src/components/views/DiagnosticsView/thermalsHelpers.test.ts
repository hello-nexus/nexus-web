import { describe, expect, it } from 'vitest';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import {
  INITIAL_THERMALS_SELECTION,
  builtInSeriesId,
  builtInOutOfRangeBands,
  builtInThresholds,
  outOfRangeBands,
  resolveThermals,
  ruleForSeries,
  selectMode,
  selectRule,
} from './thermalsHelpers';

const rule = (id: string, over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id, name: id, type: 'Temperature', parentName: '' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: false, showInHealth: true, repeatMinutes: 0, builtIn: null, ...over,
});
const cpu = rule('builtin:cpu-temp', { builtIn: 'cpuTemp' });
const gpu = rule('builtin:gpu-temp:0', { builtIn: 'gpuTemp' });
const fan = rule('u1');
const volt = rule('u2');
const rules = [cpu, gpu, fan, volt];

describe('selectRule', () => {
  it('a built-in switches to All thermals and a custom sensor to Custom', () => {
    const custom = selectRule(INITIAL_THERMALS_SELECTION, fan);
    expect(custom).toMatchObject({ mode: 'custom', custom: 'u1' });
    expect(selectRule(custom, gpu)).toMatchObject({ mode: 'all', all: 'builtin:gpu-temp:0', custom: 'u1' });
  });
});

describe('resolveThermals', () => {
  it('starts on the first built-in in All mode', () => {
    expect(resolveThermals(rules, INITIAL_THERMALS_SELECTION)).toMatchObject({ mode: 'all', selectedId: cpu.id });
  });

  it('remembers the last entry of each mode across a toggle', () => {
    let sel = selectRule(INITIAL_THERMALS_SELECTION, gpu);
    sel = selectRule(sel, volt);
    expect(resolveThermals(rules, sel)).toMatchObject({ mode: 'custom', selectedId: 'u2' });
    sel = selectMode(sel, 'all');
    expect(resolveThermals(rules, sel)).toMatchObject({ mode: 'all', selectedId: gpu.id });
    sel = selectMode(sel, 'custom');
    expect(resolveThermals(rules, sel)).toMatchObject({ mode: 'custom', selectedId: 'u2' });
  });

  it('falls back to All while there are no custom sensors', () => {
    const sel = selectMode(INITIAL_THERMALS_SELECTION, 'custom');
    expect(resolveThermals([cpu, gpu], sel)).toMatchObject({ mode: 'all', selectedId: cpu.id });
  });

  it('falls back to the first entry when the remembered one is gone', () => {
    const sel = selectRule(INITIAL_THERMALS_SELECTION, volt);
    expect(resolveThermals([cpu, fan], sel)).toMatchObject({ mode: 'custom', selectedId: 'u1' });
  });

  it('selects nothing without rules', () => {
    expect(resolveThermals([], INITIAL_THERMALS_SELECTION).selectedId).toBeNull();
  });
});

describe('chart linking', () => {
  it('maps a built-in to its chart series id and back', () => {
    expect(builtInSeriesId(gpu)).toBe('gpu-temp:0');
    expect(builtInSeriesId(fan)).toBeNull();
    expect(builtInSeriesId(undefined)).toBeNull();
    expect(ruleForSeries(rules, 'cpu-temp')).toBe(cpu);
    expect(ruleForSeries(rules, 'mem-temp')).toBeNull();
  });

  it('draws a built-in limit lines in Celsius, in the severity tone, and none for a custom sensor', () => {
    expect(builtInThresholds(rule('builtin:cpu-temp', { builtIn: 'cpuTemp', low: 5, high: 90, severity: 'act' }))).toEqual([
      { value: 5, color: 'var(--bad)' }, { value: 90, color: 'var(--bad)' },
    ]);
    expect(builtInThresholds(cpu)).toEqual([{ value: 80, color: 'var(--warn)' }]);
    expect(builtInThresholds(fan)).toEqual([]);
  });
});

describe('outOfRangeBands', () => {
  const pt = (t: number, avg: number) => ({ t, avg, max: avg });
  it('spans each run above high or below low and skips in-range stretches', () => {
    const points = [pt(0, 50), pt(10, 85), pt(20, 90), pt(30, 50), pt(40, 3), pt(50, 50)];
    expect(outOfRangeBands(points, 5, 80, 'c')).toEqual([
      { startT: 10, endT: 20, color: 'c' },
      { startT: 35, endT: 45, color: 'c' },
    ]);
  });
  it('widens a lone point by half the gap to its neighbours', () => {
    expect(outOfRangeBands([pt(0, 50), pt(10, 90), pt(30, 50)], null, 80, 'c')).toEqual([{ startT: 5, endT: 15, color: 'c' }]);
  });
  it('draws nothing without limits and treats the limit itself as in range', () => {
    expect(outOfRangeBands([pt(0, 99)], null, null, 'c')).toEqual([]);
    expect(outOfRangeBands([pt(0, 80), pt(10, 80)], null, 80, 'c')).toEqual([]);
  });
});

describe('builtInOutOfRangeBands', () => {
  const line = { id: 'cpu-temp', name: 'CPU', color: 'x', points: [{ t: 0, avg: 50, max: 50 }, { t: 10, avg: 95, max: 95 }, { t: 20, avg: 96, max: 96 }] };
  it('bands each enabled built-in against its own limits in its severity tone', () => {
    expect(builtInOutOfRangeBands([cpu], [line])).toEqual([{ startT: 10, endT: 20, color: 'var(--warn)' }]);
    expect(builtInOutOfRangeBands([{ ...cpu, severity: 'act' }], [line])[0].color).toBe('var(--bad)');
  });
  it('draws nothing for a disabled entry, a custom sensor, or an entry with no drawn series', () => {
    expect(builtInOutOfRangeBands([{ ...cpu, enabled: false }], [line])).toEqual([]);
    expect(builtInOutOfRangeBands([fan], [line])).toEqual([]);
    expect(builtInOutOfRangeBands([gpu], [line])).toEqual([]);
  });
});
