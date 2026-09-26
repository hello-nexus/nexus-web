// Pure mapping helpers turning the incidents feed into EventTimeline lanes and
// dots for the System tab's timeline. Side-effect-free (no i18n context, no
// fetch) so they're covered directly by incidentTimelineHelpers.test.ts. The
// range picker reuses the Cooling tab's temperature range controls verbatim
// (same 24h/3d/7d/14d chips + label keys + tick granularity) rather than
// duplicating them.
import type { DiagnosticsIncident, DiagnosticsIncidentSeverity, DiagnosticsIncidentSource } from '../../../api/diagnostics';
import type { EventTimelineEvent, EventTimelineLane } from '../../common/EventTimeline/EventTimeline';
import { incidentSeverityColor } from './diagnosticsHelpers';
import type { DateFormat, TimeFormat } from '../../../lib/units';
import { TEMPERATURE_RANGE_OPTIONS, xTickFormatForRange, type TemperatureRangeHours } from './temperatureHelpers';

export type IncidentRangeHours = TemperatureRangeHours;
export const INCIDENT_RANGE_OPTIONS = TEMPERATURE_RANGE_OPTIONS;
export const DEFAULT_INCIDENT_RANGE_HOURS: IncidentRangeHours = 168;

/** A relative window (hours back from now) or a single browser-local calendar
 *  day - mutually exclusive, mirroring the temperature chart's query. */
export type IncidentTimelineQuery = { hours: IncidentRangeHours } | { date: string };

const HOUR_MS = 3_600_000;

// Raw incident sources collapse into a smaller set of display lanes so the
// timeline stays readable: GPU timeout (tdr) + GPU driver faults share "GPU",
// bugchecks + live-kernel events (Windows) and kernel log errors (Linux)
// share "System crash". memDiag has no group - the Windows Memory Diagnostic
// result is a test outcome (often a clean pass), surfaced on the Memory tab,
// not the incident timeline - so it is dropped here. oomKill/segfault/
// unitFailed (Linux) join appCrash under "app".
export type IncidentGroup = 'crash' | 'hardware' | 'gpu' | 'disk' | 'shutdown' | 'app';

// Lane order: most reliability-critical first, app crashes last.
const INCIDENT_GROUP_ORDER: readonly IncidentGroup[] = ['crash', 'hardware', 'gpu', 'disk', 'shutdown', 'app'];

// Full Record (not Partial) so adding a source to DiagnosticsIncidentSource is a
// compile error until it is explicitly mapped or set to null - a new source
// must never silently vanish from the timeline. null = intentionally no lane.
const SOURCE_TO_GROUP: Record<DiagnosticsIncidentSource, IncidentGroup | null> = {
  bugcheck: 'crash',
  liveKernel: 'crash',
  whea: 'hardware',
  tdr: 'gpu',
  gpuDriver: 'gpu',
  disk: 'disk',
  dirtyShutdown: 'shutdown',
  appCrash: 'app',
  memDiag: null,
  kernel: 'crash',
  oomKill: 'app',
  segfault: 'app',
  unitFailed: 'app',
};

// Each group reuses an existing label key, so grouping adds no new locale keys.
const GROUP_LABEL_KEY: Record<IncidentGroup, string> = {
  crash: 'diagnostics.incidents.source.bugcheck',
  hardware: 'diagnostics.incidents.source.whea',
  gpu: 'diagnostics.kind.gpu',
  disk: 'diagnostics.incidents.source.disk',
  shutdown: 'diagnostics.incidents.source.dirtyShutdown',
  app: 'diagnostics.incidents.source.appCrash',
};

/** Translation key for a lane group's header (tooltip / detail list). */
export function incidentGroupLabelKey(group: string): string {
  return GROUP_LABEL_KEY[group as IncidentGroup] ?? group;
}

const SEVERITY_WEIGHT: Record<DiagnosticsIncidentSeverity, number> = { critical: 2, warning: 1, info: 0 };

/** The [start, end] epoch-ms window the timeline x-axis spans for a query. A
 *  date resolves to that browser-local calendar day; hours is a window ending
 *  at nowMs. */
export function incidentTimelineDomain(query: IncidentTimelineQuery, nowMs: number): [number, number] {
  if ('date' in query) {
    const [y, m, d] = query.date.split('-').map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    return [start, start + 24 * HOUR_MS];
  }
  return [nowMs - query.hours * HOUR_MS, nowMs];
}

/** Incidents whose timestamp falls inside the domain window. */
export function filterIncidentsToDomain(incidents: readonly DiagnosticsIncident[], domain: readonly [number, number]): DiagnosticsIncident[] {
  const [start, end] = domain;
  return incidents.filter(incident => {
    const t = new Date(incident.timeUtc).getTime();
    return t >= start && t <= end;
  });
}

/** One lane per incident GROUP, all groups always (never stripped), in
 *  INCIDENT_GROUP_ORDER. The lane set is fixed and deliberately small so the
 *  timeline's height/order stay stable and a group with no incidents in the
 *  window shows an empty track rather than disappearing. */
export function incidentLanes(translate: (key: string) => string): EventTimelineLane[] {
  return INCIDENT_GROUP_ORDER.map(group => ({ id: group, label: translate(GROUP_LABEL_KEY[group]) }));
}

/** An EventTimeline event per incident, carrying the incident itself so the
 *  tooltip can render its full detail. Colored + weighted by severity so a
 *  mixed cluster surfaces its worst dot color. */
export interface IncidentTimelineEvent extends EventTimelineEvent {
  incident: DiagnosticsIncident;
}

export function incidentEvents(incidents: readonly DiagnosticsIncident[]): IncidentTimelineEvent[] {
  const out: IncidentTimelineEvent[] = [];
  for (const incident of incidents) {
    const group = SOURCE_TO_GROUP[incident.source];
    if (!group) continue; // dropped category (e.g. memDiag)
    out.push({
      id: incident.id,
      laneId: group,
      t: new Date(incident.timeUtc).getTime(),
      color: incidentSeverityColor(incident.severity),
      weight: SEVERITY_WEIGHT[incident.severity],
      incident,
    });
  }
  return out;
}

/** X-axis tick granularity for a query, reusing the temperature chart's
 *  range-to-format mapping (a date spans one 24h day). */
export function incidentXTickFormat(query: IncidentTimelineQuery, timeFormat: TimeFormat, dateFormat: DateFormat): (t: number) => string {
  return 'date' in query ? xTickFormatForRange(24, timeFormat, dateFormat) : xTickFormatForRange(query.hours, timeFormat, dateFormat);
}
