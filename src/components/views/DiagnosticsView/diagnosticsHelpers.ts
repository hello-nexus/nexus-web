// Pure mapping/formatting helpers for the diagnostics view + widget. Kept
// side-effect-free (no i18n context, no fetch) so they're covered directly
// by diagnosticsHelpers.test.ts instead of through component rendering.
import { Gauge, HardDrive, MemoryStick, ShieldCheck, type LucideIcon } from 'lucide-react';
import type {
  CoolingDeviceStatus,
  DiagnosticsComponent,
  DiagnosticsDriveStatus,
  DiagnosticsIncidentApp,
  DiagnosticsIncidentSeverity,
  DiagnosticsKind,
  DiagnosticsReason,
  DiagnosticsStatus,
} from '../../../api/diagnostics';
import { localizeNumbers, type NumberFormat } from '../../../lib/units';

// Shown in place of a reading the service sends as null. Deliberately not a
// locale key: it renders the same in every locale.
export const UNAVAILABLE = '-';

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

/** A drive's SMART verdict on the shared three-level ladder. */
export function driveStatusLevel(status: DiagnosticsDriveStatus): DiagnosticsStatus {
  switch (status) {
    case 'good': return 'ok';
    case 'caution':
    case 'warning': return 'watch';
    case 'bad': return 'act';
    default: return 'unknown';
  }
}

export function driveStatusColor(status: DiagnosticsDriveStatus): string {
  return statusColor(driveStatusLevel(status));
}

export function driveStatusLabelKey(status: DiagnosticsDriveStatus): string {
  return statusLabelKey(driveStatusLevel(status));
}

/** A cooling device's state on the shared three-level ladder. */
export function coolingStatusLevel(status: CoolingDeviceStatus): DiagnosticsStatus {
  switch (status) {
    case 'ok': return 'ok';
    case 'suspect': return 'watch';
    case 'stalled': return 'act';
    default: return 'unknown';
  }
}

export function coolingStatusColor(status: CoolingDeviceStatus): string {
  return statusColor(coolingStatusLevel(status));
}

export function coolingStatusLabelKey(status: CoolingDeviceStatus): string {
  return statusLabelKey(coolingStatusLevel(status));
}

/** The specific wording behind a fan's level chip; null when the level says it all. */
export function coolingDetailKey(status: CoolingDeviceStatus): string | null {
  return status === 'suspect' || status === 'stalled' ? `diagnostics.cooling.status.${status}` : null;
}

export function incidentSeverityColor(severity: DiagnosticsIncidentSeverity): string {
  switch (severity) {
    case 'critical': return 'var(--bad)';
    case 'warning': return 'var(--warn)';
    default: return 'var(--text-dim)';
  }
}

export function incidentSourceLabelKey(source: string): string {
  return `diagnostics.incidents.source.${source}`;
}

/** "module (code)" from an incident's app fault, dropping either part when
 *  the server left it empty so a partial fault never reads as "module ()"
 *  or " (code)". Null when both parts are empty. */
export function incidentAppFaultLine(app: DiagnosticsIncidentApp): string | null {
  const module = app.faultingModule;
  const code = app.exceptionCode;
  if (module && code) return `${module} (${code})`;
  return module || code || null;
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

export type DiagnosticsTab = 'summary' | 'storage' | 'memory' | 'cooling' | 'system';

const ALL_DIAGNOSTICS_TABS: readonly DiagnosticsTab[] = ['summary', 'cooling', 'storage', 'memory', 'system'];

// Windows Memory Diagnostic has no Linux equivalent; macOS exposes none of
// SMART, PnP problems, or the Windows event log, so only Summary and
// Thermals (the 'cooling' key) have real content there.
const PLATFORM_DIAGNOSTICS_TABS: Record<string, readonly DiagnosticsTab[]> = {
  linux: ['summary', 'cooling', 'storage', 'system'],
  macos: ['summary', 'cooling'],
};

/** Tab keys with real functionality on the given service platform; an unknown
 *  or `windows` platform sees every tab. */
export function visibleDiagnosticsTabs(platform: string): readonly DiagnosticsTab[] {
  return PLATFORM_DIAGNOSTICS_TABS[platform] ?? ALL_DIAGNOSTICS_TABS;
}

/** One summary tile per hardware domain, aggregating the server's per-device
 *  health.components into a fixed 2x2: Sensors (cooling) / Storage / Memory / System.
 *  GPU and the Watchlist alerts fold into Cooling (its temperature already lives in the Cooling tab's
 *  chart; its throttle is a thermal/power signal). Tile status is the worst of
 *  its MEASURED members by STATUS_SEVERITY_RANK; an 'unknown' member is a probe
 *  with no source for that hardware (a GPU no NVML can read) rather than a
 *  finding, so it cannot outrank a healthy sibling - the tile reads 'unknown'
 *  only when no member was measured at all. Reasons are concatenated across
 *  every member, unknown ones included so the gap is explainable, ordered worst
 *  first so an informational line never leads an actionable one. The domain is
 *  a valid tab key, so a tile navigates straight to its tab. */
export interface DomainTile {
  domain: DiagnosticsKind;
  status: DiagnosticsStatus;
  reasons: DiagnosticsReason[];
}

const DOMAIN_TILE_KINDS: readonly { domain: DiagnosticsKind; kinds: readonly DiagnosticsKind[] }[] = [
  { domain: 'cooling', kinds: ['cooling', 'gpu', 'alerts'] },
  { domain: 'storage', kinds: ['storage'] },
  { domain: 'memory', kinds: ['memory'] },
  { domain: 'system', kinds: ['system'] },
];

// Same glyph the domain's own tab uses, so a tile reads as the tab it opens.
// Cooling folds GPU in; the tab is Sensors, so it takes that tab's Gauge icon.
export const DOMAIN_ICON: Partial<Record<DiagnosticsKind, LucideIcon>> = {
  storage: HardDrive,
  memory: MemoryStick,
  cooling: Gauge,
  system: ShieldCheck,
};

/** The tile's title key: the cooling domain is titled like its tab, Sensors. */
export function domainTitleKey(domain: DiagnosticsKind): string {
  return domain === 'cooling' ? 'diagnostics.tab.thermals' : `diagnostics.kind.${domain}`;
}

export function aggregateDomainTiles(components: DiagnosticsComponent[]): DomainTile[] {
  return DOMAIN_TILE_KINDS.map(({ domain, kinds }) => {
    const members = components.filter(c => kinds.includes(c.kind));
    const measured = members.filter(m => m.status !== 'unknown');
    let status: DiagnosticsStatus = measured.length === 0 ? 'unknown' : 'ok';
    for (const member of measured) {
      if (STATUS_SEVERITY_RANK[member.status] > STATUS_SEVERITY_RANK[status]) status = member.status;
    }
    // Watchlist alerts grade the tile but their lines stay in the alerts list below it.
    const reasons = members
      .filter(m => m.kind !== 'alerts')
      .flatMap(m => m.reasons)
      .sort((a, b) => STATUS_SEVERITY_RANK[b.severity] - STATUS_SEVERITY_RANK[a.severity]);
    return { domain, status, reasons };
  });
}

// Device Manager problem codes (Code N) mapped to their standard one-line
// explanation. Curated subset; an unmapped code falls back to a generic
// "Device Manager problem code N" line (pnpProblemLabel below) instead of a
// raw translation key.
const PNP_PROBLEM_CODE_KEYS: Record<number, string> = {
  1: 'diagnostics.system.problemCode.1',
  3: 'diagnostics.system.problemCode.3',
  10: 'diagnostics.system.problemCode.10',
  12: 'diagnostics.system.problemCode.12',
  14: 'diagnostics.system.problemCode.14',
  18: 'diagnostics.system.problemCode.18',
  21: 'diagnostics.system.problemCode.21',
  22: 'diagnostics.system.problemCode.22',
  24: 'diagnostics.system.problemCode.24',
  28: 'diagnostics.system.problemCode.28',
  31: 'diagnostics.system.problemCode.31',
  37: 'diagnostics.system.problemCode.37',
  39: 'diagnostics.system.problemCode.39',
  43: 'diagnostics.system.problemCode.43',
  45: 'diagnostics.system.problemCode.45',
};

/** Human, one-line explanation of a Device Manager problem code, resolved via
 *  the caller's t(). Unmapped codes fall back to a generic labeled line so a
 *  future code still reads as something rather than a raw translation key. */
export function pnpProblemLabel(code: number, translate: (key: string, params?: Record<string, string>) => string): string {
  const key = PNP_PROBLEM_CODE_KEYS[code];
  return key ? translate(key) : translate('diagnostics.system.problemCodeFallback', { code: String(code) });
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

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Auto-scales a raw byte count along the B/KB/MB/GB/TB/PB ladder. Byte
 *  units are treated as universal abbreviations (unlocalized), matching the
 *  existing monitoring sensor formatter's precedent. */
export function formatBytes(bytes: number, numberFormat: NumberFormat): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${BYTE_UNITS[0]}`;
  let scaled = bytes;
  let index = 0;
  while (scaled >= 1024 && index < BYTE_UNITS.length - 1) {
    scaled /= 1024;
    index++;
  }
  const decimals = index === 0 || Number.isInteger(scaled) ? 0 : 1;
  return localizeNumbers(`${scaled.toFixed(decimals)} ${BYTE_UNITS[index]}`, numberFormat);
}
