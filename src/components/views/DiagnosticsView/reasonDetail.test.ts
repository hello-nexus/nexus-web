import { describe, expect, it } from 'vitest';
import type { DiagnosticsReason } from '../../../api/diagnostics';
import { looksLikeKeyValueDetail, reasonDetailText, type ReasonDetailContext } from './reasonDetail';

const t = (key: string, vars?: Record<string, string | number>) => (
  vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
);

const ctx = (over: Partial<ReasonDetailContext> = {}): ReasonDetailContext => ({
  t, language: 'en', timeFormat: '24h', dateFormat: 'system',
  monitoringTempUnit: 'c', numberFormat: 'dot', monitoringWholeNumbers: false, ...over,
});

const reason = (code: string, params?: Record<string, string>): DiagnosticsReason => (
  { code, severity: 'act', summary: 's', detail: 'raw=1 service=text', params }
);

const AT = String(Date.UTC(2026, 10, 10, 22, 31));
const guard = { cause: 'x', active: 'false', reason: 'limit', peakC: '99.4', escalated: 'false', at: AT };

describe('reasonDetailText', () => {
  it('names the failed units for system.failedUnits, and never shows the raw detail without params', () => {
    const text = reasonDetailText(reason('system.failedUnits', { count: '1', units: 'logrotate.service' }), ctx());
    expect(text).toBe('diagnostics.reasonDetail.failedUnits(units=logrotate.service)');
    expect(reasonDetailText(reason('system.failedUnits'), ctx())).toBeNull();
  });

  it('words a thermal guard trip from its params, never from detail', () => {
    const text = reasonDetailText(reason('cooling.thermalGuardTrip', guard), ctx())!;
    expect(text).toContain('cause=diagnostics.reasonDetail.cause.limit');
    expect(text).toContain('peak=99.4°C');
    expect(text).toContain('status=diagnostics.reasonDetail.ended');
    expect(text).toContain('escalation=diagnostics.reasonDetail.notEscalated');
    expect(text).not.toContain('raw=1');
  });

  it('picks the cooling-loss cause, active and escalated wording', () => {
    const text = reasonDetailText(reason('cooling.thermalGuardTrip', { ...guard, reason: 'cooling-loss', active: 'true', escalated: 'true' }), ctx())!;
    expect(text).toContain('diagnostics.reasonDetail.cause.coolingLoss');
    expect(text).toContain('diagnostics.reasonDetail.stillActive');
    expect(text).toContain('diagnostics.reasonDetail.escalated');
  });

  it('converts the peak to Fahrenheit for a Fahrenheit user', () => {
    const text = reasonDetailText(reason('cooling.thermalGuardTrip', { ...guard, peakC: '100' }), ctx({ monitoringTempUnit: 'f' }))!;
    expect(text).toContain('peak=212°F');
  });

  it('formats the timestamp in the chosen hour cycle', () => {
    const h24 = reasonDetailText(reason('cooling.thermalGuardTrip', guard), ctx({ timeFormat: '24h' }))!;
    const h12 = reasonDetailText(reason('cooling.thermalGuardTrip', guard), ctx({ timeFormat: '12h' }))!;
    expect(h24).not.toMatch(/AM|PM/);
    expect(h12).toMatch(/AM|PM/);
  });

  it('words a finished sensor alert for a built-in with its device name', () => {
    const ended = { ruleId: 'builtin-cpu', category: 'builtin', type: 'Temperature', sensorName: 'CPU', direction: 'above', threshold: '90', peak: '95', ended: String(Date.UTC(2026, 10, 10, 20)), builtIn: 'cpuTemp' };
    const text = reasonDetailText(reason('alerts.sensorThresholdEnded', ended), ctx())!;
    expect(text).toContain('diagnostics.reasonDetail.sensorThresholdEnded(name=CPU,limit=90°C,peak=95°C');
    expect(reasonDetailText(reason('alerts.sensorThresholdEnded', { ...ended, peak: '' }), ctx())).toBeNull();
  });

  it('words a fan stall and tolerates a percent sign on the duty', () => {
    const text = reasonDetailText(reason('cooling.fanStall', { rpm: '0', targetDuty: '45%', since: String(Date.UTC(2026, 10, 10, 20)) }), ctx())!;
    expect(text).toContain('rpm=0,duty=45');
    expect(reasonDetailText(reason('cooling.fanStall', { rpm: 'null', targetDuty: '45', since: '1' }), ctx())).toBeNull();
  });

  it('words a sensor alert only when its value, threshold and name are present', () => {
    const full = { ruleId: 'r', category: 'cpu', direction: 'above', value: '95', threshold: '90', type: 'Temperature', sensorName: 'CPU Package' };
    expect(reasonDetailText(reason('alerts.sensorThreshold', full), ctx())).toBe('diagnostics.alerts.notice.above(name=CPU Package,limit=90°C,value=95°C)');
    expect(reasonDetailText(reason('alerts.sensorThreshold', { ruleId: 'r', category: 'cpu', direction: 'above' }), ctx())).toBeNull();
  });

  it('shows no tooltip for a debug-detail code with missing or incomplete params', () => {
    expect(reasonDetailText(reason('cooling.thermalGuardTrip'), ctx())).toBeNull();
    expect(reasonDetailText(reason('cooling.thermalGuardTrip', { ...guard, peakC: 'abc' }), ctx())).toBeNull();
    expect(reasonDetailText(reason('cooling.thermalGuardTrip', { ...guard, at: '' }), ctx())).toBeNull();
    expect(reasonDetailText(reason('alerts.sensorThreshold', { ruleId: 'r' }), ctx())).toBeNull();
  });

  it('keeps readable prose detail as the tooltip for codes with no formatter', () => {
    const prose = 'The drive does not expose SMART data, which USB enclosures commonly do not.';
    for (const code of ['storage.noSmartSource', 'gpu.thermalThrottle', 'memory.testFailed', 'system.pnpProblems', 'smart.reallocated']) {
      expect(reasonDetailText({ ...reason(code), detail: prose }, ctx())).toBe(prose);
    }
  });

  it('hides key=value debug detail even for an unknown code, and empty detail', () => {
    expect(reasonDetailText({ ...reason('future.code'), detail: 'cause=CPU reached its limit active=False peakC=99.4' }, ctx())).toBeNull();
    expect(reasonDetailText({ ...reason('future.code'), detail: '   ' }, ctx())).toBeNull();
  });

  it('prefers the formatted text over the detail when params are present', () => {
    const text = reasonDetailText({ ...reason('cooling.thermalGuardTrip', guard), detail: 'plain prose here' }, ctx())!;
    expect(text).toContain('diagnostics.reasonDetail.thermalGuardTrip');
    expect(text).not.toContain('plain prose');
  });

  it('does not treat prose with a single equals sign as debug text', () => {
    expect(looksLikeKeyValueDetail('Temperature a=b is high')).toBe(false);
    expect(looksLikeKeyValueDetail('a=1 b=2')).toBe(true);
  });
});
