import { describe, expect, it } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import type { DiagnosticsDrive, DiagnosticsMemoryResponse, DiagnosticsSystemResponse } from '../../../api/diagnostics';
import { memoryDetail, sensorsDetail, storageDetail, systemDetail, type SummaryDetailContext } from './summaryDetails';

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key);
const ctx: SummaryDetailContext = { t, language: 'en', tempUnit: 'c', numberFormat: 'dot', wholeNumbers: true };
const NOW = Date.parse('2026-01-02T00:00:00Z');

const rule = (id: string, over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id, name: id, type: 'Temperature', parentName: '' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: false, notifyMobile: false, showInHealth: true, repeatMinutes: 0, builtIn: null, ...over,
});
const state = (ruleId: string, over: Partial<SensorAlertState> = {}): SensorAlertState => ({ ruleId, state: 'ok', value: 50, acknowledged: false, ...over });

describe('sensorsDetail', () => {
  it('is null with an empty watchlist', () => {
    expect(sensorsDetail([], [], ctx)).toBeNull();
  });
  it('counts entries, names the CPU and GPU readings and the alerts-off total', () => {
    const rules = [rule('a', { builtIn: 'cpuTemp' }), rule('b', { builtIn: 'gpuTemp' }), rule('c', { enabled: false })];
    const d = sensorsDetail(rules, [state('a', { value: 61 }), state('b', { value: 40 }), state('c', { state: 'off' })], ctx)!;
    expect(d.count).toBe('diagnostics.summary.count.sensors.other(count=3)');
    expect(d.lines).toEqual(['diagnostics.summary.sensors.allInRange', 'a: 61°C', 'b: 40°C', 'diagnostics.summary.sensors.alertsOff(count=1)']);
  });
  it('skips the reading of an unreported built-in and the in-range line when every alert is off', () => {
    const d = sensorsDetail([rule('a', { builtIn: 'cpuTemp', enabled: false })], [state('a', { state: 'unavailable', value: null })], ctx)!;
    expect(d.count).toBe('diagnostics.summary.count.sensors.one(count=1)');
    expect(d.lines).toEqual(['diagnostics.summary.sensors.alertsOff(count=1)']);
  });
});

const drive = (name: string, over: Partial<DiagnosticsDrive> = {}): DiagnosticsDrive => ({
  id: name, name, serial: '', bus: 'nvme', sizeBytes: null, temperatureC: 38, powerOnHours: null, powerCycles: null,
  healthPercent: 97, status: 'healthy', statusReasons: [], attributes: [], nvme: null, ...over,
} as DiagnosticsDrive);

describe('storageDetail', () => {
  it('lists model, health and temperature, capping at three with a +N more line', () => {
    const d = storageDetail([drive('A'), drive('B', { healthPercent: null }), drive('C', { temperatureC: null }), drive('D'), drive('E')], ctx)!;
    expect(d.count).toBe('diagnostics.summary.count.drives.other(count=5)');
    expect(d.lines).toEqual(['A, diagnostics.summary.storage.health(percent=97), 38°C', 'B, 38°C', 'C, diagnostics.summary.storage.health(percent=97)', 'diagnostics.summary.more(count=2)']);
  });
  it('is null with no drives', () => {
    expect(storageDetail([], ctx)).toBeNull();
  });
});

const GIB = 1024 ** 3;
const mem = (over: Partial<DiagnosticsMemoryResponse> = {}): DiagnosticsMemoryResponse => ({
  supported: true,
  modules: [
    { slot: 'A', sizeBytes: 16 * GIB, maxSpeedMts: 6400, configuredSpeedMts: 6000, manufacturer: null, partNumber: null },
    { slot: 'B', sizeBytes: 16 * GIB, maxSpeedMts: 6400, configuredSpeedMts: 6000, manufacturer: null, partNumber: null },
  ],
  xmpLikelyActive: null, lastTest: null, testScheduled: false, ...over,
});

describe('memoryDetail', () => {
  it('shows the stick count, total capacity with speed, and no test yet', () => {
    const d = memoryDetail(mem(), NOW, ctx)!;
    expect(d.count).toBe('diagnostics.summary.count.memory.other(count=2)');
    expect(d.lines).toEqual(['diagnostics.summary.memory.total(size=32 GB), 6000 MT/s', 'diagnostics.memory.lastTest: diagnostics.memory.testResult.never']);
  });
  it('shows the last test result with its age', () => {
    const d = memoryDetail(mem({ lastTest: { timeUtc: '2026-01-01T00:00:00Z', result: 'passed', detail: null } }), NOW, ctx)!;
    expect(d.lines[1]).toMatch(/^diagnostics\.memory\.lastTest: diagnostics\.memory\.testResult\.passed \(/);
  });
  it('is null when unsupported or no modules', () => {
    expect(memoryDetail(mem({ supported: false }), NOW, ctx)).toBeNull();
    expect(memoryDetail(mem({ modules: [] }), NOW, ctx)).toBeNull();
  });
});

const sys = (over: Partial<DiagnosticsSystemResponse> = {}): DiagnosticsSystemResponse => ({
  supported: true, pnpProblems: [],
  counts30d: { whea: 0, bugchecks: 0, dirtyShutdowns: 0, diskErrors: 0, tdrs: 0, appCrashes: 0 }, ...over,
});

describe('systemDetail', () => {
  it('states no device problems and a quiet 30 days, with no count line', () => {
    expect(systemDetail(sys(), ctx)).toEqual({ count: null, lines: ['diagnostics.system.pnpEmpty', 'diagnostics.summary.system.quiet'] });
  });
  it('drops the quiet line once any event was counted, and is null when unsupported', () => {
    expect(systemDetail(sys({ counts30d: { whea: 0, bugchecks: 0, dirtyShutdowns: 1, diskErrors: 0, tdrs: 0, appCrashes: 0 } }), ctx)!.lines).toEqual(['diagnostics.system.pnpEmpty']);
    expect(systemDetail(sys({ supported: false }), ctx)).toBeNull();
  });
});
