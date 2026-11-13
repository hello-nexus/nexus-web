import { describe, expect, it } from 'vitest';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import {
  INITIAL_THERMALS_SELECTION,
  builtInSeriesId,
  deselect,
  groupOf,
  groupedRules,
  groupsPresent,
  outOfRangeBands,
  resolveThermals,
  ruleForSeries,
  ruleLines,
  ruleOutOfRangeBands,
  ruleThresholds,
  selectGroup,
  selectRule,
  seriesIdOfRule,
  visibleSelection,
  watchlistLink,
  parseWatchlistLink,
  GROUP_ICON,
  THERMAL_GROUP_ORDER,
} from './thermalsHelpers';

const rule = (id: string, over: Partial<SensorAlertRule> = {}, type = 'Temperature'): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id, name: id, type, parentName: '' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: false, notifyMobile: false, showInHealth: true, repeatMinutes: 0, builtIn: null, ...over,
});
const cpu = rule('builtin:cpu-temp', { builtIn: 'cpuTemp' });
const gpu = rule('builtin:gpu-temp:0', { builtIn: 'gpuTemp' });
const temp = rule('u1');
const load = rule('u2', {}, 'Load');
const load2 = rule('u3', {}, 'Load');
const builtInFan = rule('builtin:fan:1', { builtIn: 'fanSpeed' }, 'Fan');
const rules = [cpu, gpu, temp, load, load2, builtInFan];

describe('grouping', () => {
  it('groups an entry by its sensor type, a fan built-in with the fan speeds', () => {
    expect(groupOf(cpu)).toBe('thermals');
    expect(groupOf(temp)).toBe('thermals');
    expect(groupOf(load)).toBe('loads');
    expect(groupOf(builtInFan)).toBe('fans');
    expect(groupOf(rule('v', {}, 'Voltage'))).toBe('voltages');
    expect(groupOf(rule('p', {}, 'Power'))).toBe('power');
    expect(groupOf(rule('c', {}, 'Clock'))).toBe('clocks');
    expect(groupOf(rule('a', {}, 'Current'))).toBe('currents');
  });

  it('offers Thermals always and then only the groups that have an entry, in chart order', () => {
    expect(groupsPresent([])).toEqual(['thermals']);
    expect(groupsPresent(rules)).toEqual(['thermals', 'loads', 'fans']);
    expect(groupsPresent([load])).toEqual(['thermals', 'loads']);
  });

  it('sections the watchlist by group, built-ins before custom entries', () => {
    expect(groupedRules([temp, cpu, load, gpu]).map(s => [s.group, s.rules.map(r => r.id)])).toEqual([
      ['thermals', ['builtin:cpu-temp', 'builtin:gpu-temp:0', 'u1']],
      ['loads', ['u2']],
    ]);
  });
});

describe('GROUP_ICON', () => {
  it('has an empty-state glyph for every group, distinct per group', () => {
    const icons = THERMAL_GROUP_ORDER.map(g => GROUP_ICON[g]);
    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(THERMAL_GROUP_ORDER.length);
  });
});

describe('selection', () => {
  it('picking an entry shows its group with that entry selected', () => {
    expect(selectRule(INITIAL_THERMALS_SELECTION, load)).toEqual({ group: 'loads', selectedId: 'u2' });
  });

  it('starts with nothing selected, and a group button shows that group with nothing selected', () => {
    expect(resolveThermals(rules, INITIAL_THERMALS_SELECTION)).toMatchObject({ group: 'thermals', selectedId: null });
    expect(resolveThermals(rules, selectGroup(INITIAL_THERMALS_SELECTION, 'loads'))).toMatchObject({ group: 'loads', selectedId: null });
  });

  it('deselecting keeps the group and selects nothing', () => {
    const sel = deselect(selectRule(INITIAL_THERMALS_SELECTION, load2));
    expect(resolveThermals(rules, sel)).toMatchObject({ group: 'loads', selectedId: null });
    expect(deselect({ group: 'loads', selectedId: 'u2' })).toEqual({ group: 'loads', selectedId: null });
  });

  it('follows the picked entry to its group even when the remembered group differs', () => {
    expect(resolveThermals(rules, { group: 'thermals', selectedId: 'u3' })).toMatchObject({ group: 'loads', selectedId: 'u3' });
  });

  it('falls back to Thermals when the remembered group has no entries any more', () => {
    expect(resolveThermals([cpu], { group: 'loads', selectedId: null })).toMatchObject({ group: 'thermals', selectedId: null });
  });

  it('selects nothing without rules', () => {
    expect(resolveThermals([], INITIAL_THERMALS_SELECTION).selectedId).toBeNull();
  });
});

describe('chart linking', () => {
  it('maps a device temperature to its monitoring series and any other entry to its own', () => {
    expect(builtInSeriesId(gpu)).toBe('gpu-temp:0');
    expect(builtInSeriesId(temp)).toBeNull();
    expect(seriesIdOfRule(gpu)).toBe('gpu-temp:0');
    expect(seriesIdOfRule(temp)).toBe('u1');
    expect(seriesIdOfRule(builtInFan)).toBe('builtin:fan:1');
    expect(ruleForSeries(rules, 'cpu-temp')).toBe(cpu);
    expect(ruleForSeries(rules, 'u2')).toBe(load);
    expect(ruleForSeries(rules, 'mem-temp')).toBeNull();
  });

  it('draws limit lines in the severity tone', () => {
    expect(ruleThresholds(rule('builtin:cpu-temp', { builtIn: 'cpuTemp', low: 5, high: 90, severity: 'act' }))).toEqual([
      { value: 5, color: 'var(--bad)' }, { value: 90, color: 'var(--bad)' },
    ]);
    expect(ruleThresholds(load)).toEqual([{ value: 80, color: 'var(--warn)' }]);
    expect(ruleThresholds(undefined)).toEqual([]);
  });

  it('draws each recorded entry as a line in its own color, none repeating or taken', () => {
    const hist = (id: string) => ({ id, kind: 'sensorAlert', name: id, points: [{ t: 1, avg: 2, max: 3 }] });
    const taken = new Set(['#3a89e8']);
    const lines = ruleLines([load, load2, temp], [hist('u2'), hist('u3')], r => `n-${r.id}`, taken);
    expect(lines.map(l => l.id)).toEqual(['u2', 'u3']);
    expect(lines.map(l => l.name)).toEqual(['n-u2', 'n-u3']);
    expect(new Set(lines.map(l => l.color)).size).toBe(2);
    expect(lines.some(l => taken.has(l.color))).toBe(false);
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

describe('ruleOutOfRangeBands', () => {
  const line = { id: 'cpu-temp', name: 'CPU', color: 'x', points: [{ t: 0, avg: 50, max: 50 }, { t: 10, avg: 95, max: 95 }, { t: 20, avg: 96, max: 96 }] };
  const loadLine = { id: 'u2', name: 'L', color: 'x', points: [{ t: 0, avg: 10, max: 10 }, { t: 10, avg: 99, max: 99 }] };
  it('bands each enabled entry against its own limits in its severity tone, in every group', () => {
    expect(ruleOutOfRangeBands([cpu], [line])).toEqual([{ startT: 10, endT: 20, color: 'var(--warn)' }]);
    expect(ruleOutOfRangeBands([{ ...cpu, severity: 'act' }], [line])[0].color).toBe('var(--bad)');
    expect(ruleOutOfRangeBands([load], [loadLine])).toHaveLength(1);
  });
  it('draws nothing for a disabled entry or an entry with no drawn series', () => {
    expect(ruleOutOfRangeBands([{ ...cpu, enabled: false }], [line])).toEqual([]);
    expect(ruleOutOfRangeBands([gpu], [line])).toEqual([]);
  });
});

describe('visibleSelection', () => {
  const a = rule('a');
  const b = rule('b');
  it('keeps the selected entry while the filtered list still has it', () => {
    expect(visibleSelection(a, [{ rules: [a, b] }])).toBe(a);
  });
  it('drops it once the filter hides it, and for no selection', () => {
    expect(visibleSelection(a, [{ rules: [b] }])).toBeUndefined();
    expect(visibleSelection(a, [])).toBeUndefined();
    expect(visibleSelection(undefined, [{ rules: [a] }])).toBeUndefined();
  });
});

describe('watchlist deep link', () => {
  it('round-trips an entry id through the route tab, ids with colons included', () => {
    for (const id of ['abc-123', 'builtin:gpu-temp:0', 'a/b c']) {
      expect(parseWatchlistLink(watchlistLink(id))).toEqual({ tab: 'cooling', ruleId: id });
    }
  });
  it('leaves a plain tab, no tab and a malformed escape without an entry', () => {
    expect(parseWatchlistLink('cooling')).toEqual({ tab: 'cooling', ruleId: null });
    expect(parseWatchlistLink(null)).toEqual({ tab: null, ruleId: null });
    expect(parseWatchlistLink('cooling:%E0%A4%A')).toEqual({ tab: 'cooling', ruleId: null });
    expect(parseWatchlistLink('cooling:')).toEqual({ tab: 'cooling', ruleId: null });
  });
});
