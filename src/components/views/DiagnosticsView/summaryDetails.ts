// The at-a-glance facts an OK Summary card shows under its title, built from data the tabs already fetch.
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import type { DiagnosticsDrive, DiagnosticsMemoryResponse, DiagnosticsSystemResponse } from '../../../api/diagnostics';
import type { Language } from '../../../lib/settings';
import type { NumberFormat, TempUnit } from '../../../lib/units';
import { localizeNumbers, convertTemperature, tempUnitSymbol } from '../../../lib/units';
import { pluralKey } from '../../../lib/pluralKey';
import { formatAlertValue, rowTitles } from './sensorAlertHelpers';
import { formatBytes, relativeTimeLabel } from './diagnosticsHelpers';

export interface SummaryDetail {
  /** The leading count line, e.g. "3 drives". */
  count: string | null;
  /** Short supporting lines under it. */
  lines: string[];
}

export interface SummaryDetailContext {
  t: (key: string, vars?: Record<string, string | number>) => string;
  language: Language;
  tempUnit: TempUnit;
  numberFormat: NumberFormat;
  wholeNumbers: boolean;
}

/** Drive lines shown before the rest fold into "+N more". */
export const MAX_DRIVE_LINES = 3;
/** Built-in readings a Sensors card names. */
const KEY_READINGS = ['cpuTemp', 'gpuTemp'] as const;

function countLine(ctx: SummaryDetailContext, base: string, count: number): string {
  return ctx.t(pluralKey(base, ctx.language, count), { count });
}

/** Sensors: how many entries the Watchlist holds, the CPU and GPU readings, and how many have alerts off. */
export function sensorsDetail(
  rules: readonly SensorAlertRule[],
  states: readonly SensorAlertState[],
  ctx: SummaryDetailContext,
): SummaryDetail | null {
  if (rules.length === 0) return null;
  const lines: string[] = [];
  const off = rules.filter(r => !r.enabled).length;
  const alerting = states.some(s => s.state === 'active');
  if (off < rules.length && !alerting) lines.push(ctx.t('diagnostics.summary.sensors.allInRange'));
  for (const kind of KEY_READINGS) {
    const rule = rules.find(r => r.builtIn === kind);
    const state = rule ? states.find(s => s.ruleId === rule.id) : undefined;
    if (!rule || state?.value == null || state.state === 'unavailable') continue;
    lines.push(`${rowTitles(rule, ctx.t, undefined, ctx.language).title}: ${formatAlertValue(state.value, rule.sensor.type, ctx.tempUnit, ctx.numberFormat, ctx.wholeNumbers)}`);
  }
  if (off > 0) lines.push(ctx.t('diagnostics.summary.sensors.alertsOff', { count: off }));
  return { count: countLine(ctx, 'diagnostics.summary.count.sensors', rules.length), lines };
}

/** Storage: the drive count, then model, health and temperature per drive (a few, then "+N more"). */
export function storageDetail(drives: readonly DiagnosticsDrive[], ctx: SummaryDetailContext): SummaryDetail | null {
  if (drives.length === 0) return null;
  const lines = drives.slice(0, MAX_DRIVE_LINES).map(d => {
    const parts = [d.name];
    if (d.healthPercent !== null) parts.push(ctx.t('diagnostics.summary.storage.health', { percent: localizeNumbers(String(Math.round(d.healthPercent)), ctx.numberFormat) }));
    if (d.temperatureC !== null) parts.push(localizeNumbers(`${Math.round(convertTemperature(d.temperatureC, ctx.tempUnit))}${tempUnitSymbol(ctx.tempUnit)}`, ctx.numberFormat));
    return parts.join(', ');
  });
  if (drives.length > MAX_DRIVE_LINES) lines.push(ctx.t('diagnostics.summary.more', { count: drives.length - MAX_DRIVE_LINES }));
  return { count: countLine(ctx, 'diagnostics.summary.count.drives', drives.length), lines };
}

/** Memory: the stick count, total capacity with speed, and the last memory test. */
export function memoryDetail(memory: DiagnosticsMemoryResponse, now: number, ctx: SummaryDetailContext): SummaryDetail | null {
  if (!memory.supported || memory.modules.length === 0) return null;
  const sizes = memory.modules.map(m => m.sizeBytes).filter((v): v is number => v !== null);
  const speed = memory.modules.map(m => m.configuredSpeedMts).find((v): v is number => v !== null);
  const capacity: string[] = [];
  if (sizes.length > 0) capacity.push(ctx.t('diagnostics.summary.memory.total', { size: formatBytes(sizes.reduce((a, b) => a + b, 0), ctx.numberFormat) }));
  if (speed !== undefined) capacity.push(localizeNumbers(`${speed} MT/s`, ctx.numberFormat));
  const lines = capacity.length > 0 ? [capacity.join(', ')] : [];
  const test = memory.lastTest
    ? `${ctx.t(`diagnostics.memory.testResult.${memory.lastTest.result}`)} (${relativeTimeLabel(memory.lastTest.timeUtc, now, ctx.t)})`
    : ctx.t('diagnostics.memory.testResult.never');
  lines.push(`${ctx.t('diagnostics.memory.lastTest')}: ${test}`);
  return { count: countLine(ctx, 'diagnostics.summary.count.memory', memory.modules.length), lines };
}

/** System: no device problems, and a quiet last 30 days. The service reports no device total, so there is no count line. */
export function systemDetail(system: DiagnosticsSystemResponse, ctx: SummaryDetailContext): SummaryDetail | null {
  if (!system.supported) return null;
  const lines: string[] = [];
  if (system.pnpProblems.length === 0) lines.push(ctx.t('diagnostics.system.pnpEmpty'));
  const events = Object.values(system.counts30d).reduce((a, b) => a + b, 0);
  if (events === 0) lines.push(ctx.t('diagnostics.summary.system.quiet'));
  return lines.length > 0 ? { count: null, lines } : null;
}
