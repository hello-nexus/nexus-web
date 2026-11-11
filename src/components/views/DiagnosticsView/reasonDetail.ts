import type { DiagnosticsReason } from '../../../api/diagnostics';
import { formatDateTime, hour12OptionFor, type DateFormat, type TimeFormat } from '../../../lib/units';
import type { Language } from '../../../lib/settings';
import { builtInParamLabel, formatAlertValue, type AlertUnitPrefs } from './sensorAlertHelpers';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface ReasonDetailContext extends AlertUnitPrefs {
  t: Translate;
  language: Language;
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
}

const num = (raw: string | undefined): number | null => {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const bool = (raw: string | undefined): boolean | null => (raw === 'true' ? true : raw === 'false' ? false : null);

function timeText(ctx: ReasonDetailContext, ms: number | null): string | null {
  if (ms === null) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateTime(date, ctx.dateFormat, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: hour12OptionFor(ctx.timeFormat),
  }, { variant: 'short', locale: ctx.language });
}

const stampMs = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = num(raw);
  if (n !== null) return n;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
};

const temp = (ctx: ReasonDetailContext, c: number) => formatAlertValue(c, 'Temperature', ctx.monitoringTempUnit, ctx.numberFormat, ctx.monitoringWholeNumbers);

type Formatter = (p: Record<string, string>, ctx: ReasonDetailContext) => string | null;

const FORMATTERS: Partial<Record<string, Formatter>> = {
  'cooling.thermalGuardTrip': (p, ctx) => {
    const peak = num(p.peakC);
    const at = timeText(ctx, num(p.at));
    const active = bool(p.active);
    const escalated = bool(p.escalated);
    if (peak === null || at === null || active === null || escalated === null) return null;
    return ctx.t('diagnostics.reasonDetail.thermalGuardTrip', {
      cause: ctx.t(p.reason === 'cooling-loss' ? 'diagnostics.reasonDetail.cause.coolingLoss' : 'diagnostics.reasonDetail.cause.limit'),
      peak: temp(ctx, peak),
      time: at,
      status: ctx.t(active ? 'diagnostics.reasonDetail.stillActive' : 'diagnostics.reasonDetail.ended'),
      escalation: ctx.t(escalated ? 'diagnostics.reasonDetail.escalated' : 'diagnostics.reasonDetail.notEscalated'),
    });
  },
  'cooling.fanStall': stall,
  'cooling.pumpStall': stall,
  'alerts.sensorThreshold': (p, ctx) => {
    const value = num(p.value);
    const threshold = num(p.threshold);
    if (value === null || threshold === null || !p.type || !p.sensorName || (p.direction !== 'above' && p.direction !== 'below')) return null;
    const fmt = (v: number) => formatAlertValue(v, p.type, ctx.monitoringTempUnit, ctx.numberFormat, ctx.monitoringWholeNumbers);
    return ctx.t(p.direction === 'below' ? 'diagnostics.alerts.notice.below' : 'diagnostics.alerts.notice.above', {
      name: alertParamName(p, ctx), limit: fmt(threshold), value: fmt(value),
    });
  },
  'alerts.sensorThresholdEnded': (p, ctx) => {
    const peak = num(p.peak);
    const threshold = num(p.threshold);
    const ended = timeText(ctx, num(p.ended));
    if (peak === null || threshold === null || ended === null || !p.type || !p.sensorName) return null;
    const fmt = (v: number) => formatAlertValue(v, p.type, ctx.monitoringTempUnit, ctx.numberFormat, ctx.monitoringWholeNumbers);
    return ctx.t('diagnostics.reasonDetail.sensorThresholdEnded', {
      name: alertParamName(p, ctx), limit: fmt(threshold), peak: fmt(peak), time: ended,
    });
  },
};

/** A health reason's sensor name: localized for a built-in, else the name the service sent. */
const alertParamName = (p: Record<string, string>, ctx: ReasonDetailContext): string => builtInParamLabel(ctx.t, p.builtIn) ?? p.sensorName;

function stall(p: Record<string, string>, ctx: ReasonDetailContext): string | null {
  const rpm = num(p.rpm);
  const duty = num(p.targetDuty?.replace('%', ''));
  const since = timeText(ctx, stampMs(p.since));
  if (rpm === null || duty === null || since === null) return null;
  return ctx.t('diagnostics.reasonDetail.stall', { rpm: Math.round(rpm), duty: Math.round(duty), time: since });
}

// Codes whose service detail is key=value debug text, never prose.
const DEBUG_DETAIL_CODES: ReadonlySet<string> = new Set([
  'cooling.thermalGuardTrip', 'cooling.fanStall', 'cooling.pumpStall', 'alerts.sensorThreshold', 'alerts.sensorThresholdEnded',
]);

const KEY_VALUE_START = /^\s*\w+=/;
const KEY_VALUE_TOKEN = /\b\w+=/g;

/** True for "a=1 b=two words" style debug text; a values-with-spaces line still starts with key= and repeats it. */
export function looksLikeKeyValueDetail(detail: string): boolean {
  return KEY_VALUE_START.test(detail) && (detail.match(KEY_VALUE_TOKEN)?.length ?? 0) >= 2;
}

/** Tooltip text for a reason: the formatted params text when a formatter has what it needs, else the service detail when it is prose, else nothing. */
export function reasonDetailText(reason: DiagnosticsReason, ctx: ReasonDetailContext): string | null {
  const format = FORMATTERS[reason.code];
  const formatted = format && reason.params ? format(reason.params, ctx) : null;
  if (formatted !== null) return formatted;
  if (DEBUG_DETAIL_CODES.has(reason.code) || looksLikeKeyValueDetail(reason.detail)) return null;
  return reason.detail.trim() === '' ? null : reason.detail;
}
