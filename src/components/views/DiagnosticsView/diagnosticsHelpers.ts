// Pure mapping/formatting helpers for the diagnostics view + widget. Kept
// side-effect-free (no i18n context, no fetch) so they're covered directly
// by diagnosticsHelpers.test.ts instead of through component rendering.
import type {
  CoolingDeviceStatus,
  DiagnosticsComponent,
  DiagnosticsDriveStatus,
  DiagnosticsIncidentSeverity,
  DiagnosticsKind,
  DiagnosticsReason,
  DiagnosticsStatus,
} from '../../../api/diagnostics';

const STATUS_SEVERITY_RANK: Record<DiagnosticsStatus, number> = { act: 3, watch: 2, unknown: 1, ok: 0 };

/** ok/watch/act/unknown -> the CSS color token the status pill/dot uses. */
export function statusColor(status: DiagnosticsStatus): string {
  switch (status) {
    case 'ok': return 'var(--good)';
    case 'watch': return 'var(--warn)';
    case 'act': return 'var(--bad)';
    default: return 'var(--text-dim)';
  }
}

export function statusLabelKey(status: DiagnosticsStatus): string {
  return `diagnostics.status.${status}`;
}

export function driveStatusColor(status: DiagnosticsDriveStatus): string {
  switch (status) {
    case 'good': return 'var(--good)';
    case 'caution': return 'var(--warn)';
    case 'warning': return 'var(--warn)';
    case 'bad': return 'var(--bad)';
    default: return 'var(--text-dim)';
  }
}

export function driveStatusLabelKey(status: DiagnosticsDriveStatus): string {
  return `diagnostics.driveStatus.${status}`;
}

export function coolingStatusColor(status: CoolingDeviceStatus): string {
  switch (status) {
    case 'ok': return 'var(--good)';
    case 'suspect': return 'var(--warn)';
    case 'stalled': return 'var(--bad)';
    default: return 'var(--text-dim)';
  }
}

export function coolingStatusLabelKey(status: CoolingDeviceStatus): string {
  return `diagnostics.cooling.status.${status}`;
}

export function incidentSeverityColor(severity: DiagnosticsIncidentSeverity): string {
  switch (severity) {
    case 'critical': return 'var(--bad)';
    case 'warning': return 'var(--warn)';
    default: return 'var(--text-dim)';
  }
}

export function incidentSeverityLabelKey(severity: DiagnosticsIncidentSeverity): string {
  return `diagnostics.incidents.severity.${severity}`;
}

export function incidentSourceLabelKey(source: string): string {
  return `diagnostics.incidents.source.${source}`;
}

/** A reason's translation key, built directly from its stable machine code
 *  (e.g. "smart.reallocated" -> "diagnostics.reason.smart.reallocated"). */
export function reasonLabelKey(reason: DiagnosticsReason): string {
  return `diagnostics.reason.${reason.code}`;
}

/**
 * Resolves a reason's display label: the mapped i18n string when the code is
 * known, else the server's own summary so an unmapped future code degrades
 * to readable text instead of a raw translation key. `translate` is the
 * caller's t() - passed in rather than imported so this stays pure/testable.
 */
export function reasonLabel(reason: DiagnosticsReason, translate: (key: string) => string): string {
  const key = reasonLabelKey(reason);
  const translated = translate(key);
  return translated === key ? reason.summary : translated;
}

export interface RelativeTimeToken {
  key: string;
  n?: number;
}

/** Buckets an ISO timestamp against `nowMs` into a diagnostics.time.* token
 *  the caller feeds to t(). Mirrors the benchmark widget's day/hour/minute
 *  buckets so relative-time copy reads the same across the app. */
export function relativeTimeToken(iso: string, nowMs: number): RelativeTimeToken {
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, nowMs - then);
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (days > 0) return { key: 'diagnostics.time.daysAgo', n: days };
  if (hours > 0) return { key: 'diagnostics.time.hoursAgo', n: hours };
  if (mins > 0) return { key: 'diagnostics.time.minsAgo', n: mins };
  return { key: 'diagnostics.time.justNow' };
}

/** relativeTimeToken resolved straight to display text via the caller's t(). */
export function relativeTimeLabel(iso: string, nowMs: number, translate: (key: string, params?: Record<string, string>) => string): string {
  const token = relativeTimeToken(iso, nowMs);
  return translate(token.key, token.n !== undefined ? { n: String(token.n) } : undefined);
}

export interface DurationToken {
  key: string;
  params: Record<string, string>;
}

/** Buckets a cumulative microsecond counter (GPU throttle counters) into a
 *  diagnostics.duration.* token: seconds under a minute, minutes under an
 *  hour, else hours+minutes. */
export function durationToken(microseconds: number): DurationToken {
  const totalSeconds = Math.max(0, Math.floor(microseconds / 1_000_000));
  if (totalSeconds < 60) {
    return { key: 'diagnostics.duration.seconds', params: { s: String(totalSeconds) } };
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return { key: 'diagnostics.duration.minutes', params: { m: String(totalMinutes) } };
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { key: 'diagnostics.duration.hoursMinutes', params: { h: String(hours), m: String(minutes) } };
}

/** durationToken resolved straight to display text via the caller's t(). */
export function durationLabel(microseconds: number, translate: (key: string, params?: Record<string, string>) => string): string {
  const token = durationToken(microseconds);
  return translate(token.key, token.params);
}

export type SectionRenderState = 'loading' | 'error' | 'notSupported' | 'empty' | 'content';

/**
 * Which of five states a diagnostics section should render. Shared by every
 * section (storage/memory/gpu/cooling/system/incidents) so the
 * loading/error/unsupported/empty/content branching stays consistent
 * across them instead of six near-identical copies.
 */
export function resolveSectionState(opts: {
  hasData: boolean;
  loading: boolean;
  error: boolean;
  supported: boolean;
  isEmpty: boolean;
}): SectionRenderState {
  if (!opts.hasData) return opts.error ? 'error' : 'loading';
  if (!opts.supported) return 'notSupported';
  if (opts.isEmpty) return 'empty';
  return 'content';
}

/** The single highest-severity reason across every health component, or null
 *  when nothing is flagged. Used by the panel widget's compact card. */
export function worstReason(components: DiagnosticsComponent[]): DiagnosticsReason | null {
  let worst: DiagnosticsReason | null = null;
  for (const component of components) {
    for (const reason of component.reasons) {
      if (!worst || STATUS_SEVERITY_RANK[reason.severity] > STATUS_SEVERITY_RANK[worst.severity]) worst = reason;
    }
  }
  return worst;
}

/** The worst status among every component of a given kind; 'unknown' when
 *  the kind has no components at all. Drives the widget's per-kind dots. */
export function kindStatus(components: DiagnosticsComponent[], kind: DiagnosticsKind): DiagnosticsStatus {
  const matching = components.filter(c => c.kind === kind);
  if (matching.length === 0) return 'unknown';
  let worst: DiagnosticsStatus = 'ok';
  for (const component of matching) {
    if (STATUS_SEVERITY_RANK[component.status] > STATUS_SEVERITY_RANK[worst]) worst = component.status;
  }
  return worst;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Auto-scales a raw byte count along the B/KB/MB/GB/TB/PB ladder. Byte
 *  units are treated as universal abbreviations (unlocalized), matching the
 *  existing monitoring sensor formatter's precedent. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${BYTE_UNITS[0]}`;
  let scaled = bytes;
  let index = 0;
  while (scaled >= 1024 && index < BYTE_UNITS.length - 1) {
    scaled /= 1024;
    index++;
  }
  const decimals = index === 0 || Number.isInteger(scaled) ? 0 : 1;
  return `${scaled.toFixed(decimals)} ${BYTE_UNITS[index]}`;
}
