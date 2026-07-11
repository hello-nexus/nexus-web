// Pure mapping helpers turning the incidents feed into EventTimeline lanes and
// dots for the System tab's timeline. Side-effect-free (no i18n context, no
// fetch) so they're covered directly by incidentTimelineHelpers.test.ts. The
// range picker reuses the Cooling tab's temperature range controls verbatim
// (same 24h/3d/7d/14d chips + label keys + tick granularity) rather than
// duplicating them.
import type { DiagnosticsIncident, DiagnosticsIncidentSeverity, DiagnosticsIncidentSource } from '../../../api/diagnostics';
import type { EventTimelineEvent, EventTimelineLane } from '../../common/EventTimeline/EventTimeline';
import { incidentSeverityColor, incidentSourceLabelKey } from './diagnosticsHelpers';
import { TEMPERATURE_RANGE_OPTIONS, xTickFormatForRange, type TemperatureRangeHours } from './temperatureHelpers';

export type IncidentRangeHours = TemperatureRangeHours;
export const INCIDENT_RANGE_OPTIONS = TEMPERATURE_RANGE_OPTIONS;
export const DEFAULT_INCIDENT_RANGE_HOURS: IncidentRangeHours = 168;

/** A relative window (hours back from now) or a single browser-local calendar
 *  day - mutually exclusive, mirroring the temperature chart's query. */
export type IncidentTimelineQuery = { hours: IncidentRangeHours } | { date: string };

const HOUR_MS = 3_600_000;

// Lane order: reliability-critical sources first, app crashes last, so the
// most severe categories sit at the top of the timeline regardless of which
// sources happen to be present.
const INCIDENT_SOURCE_ORDER: readonly DiagnosticsIncidentSource[] = [
  'bugcheck', 'whea', 'liveKernel', 'tdr', 'gpuDriver', 'disk', 'dirtyShutdown', 'memDiag', 'appCrash',
];

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

/** One lane per incident source, ALL categories always (never stripped), in
 *  INCIDENT_SOURCE_ORDER. The lane set is fixed so the timeline's height and
 *  lane order stay stable across ranges, and a category with no incidents in
 *  the window shows an empty track rather than disappearing. */
export function incidentLanes(translate: (key: string) => string): EventTimelineLane[] {
  return INCIDENT_SOURCE_ORDER.map(source => ({ id: source, label: translate(incidentSourceLabelKey(source)) }));
}

/** An EventTimeline event per incident, carrying the incident itself so the
 *  tooltip can render its full detail. Colored + weighted by severity so a
 *  mixed cluster surfaces its worst dot color. */
export interface IncidentTimelineEvent extends EventTimelineEvent {
  incident: DiagnosticsIncident;
}

export function incidentEvents(incidents: readonly DiagnosticsIncident[]): IncidentTimelineEvent[] {
  return incidents.map(incident => ({
    id: incident.id,
    laneId: incident.source,
    t: new Date(incident.timeUtc).getTime(),
    color: incidentSeverityColor(incident.severity),
    weight: SEVERITY_WEIGHT[incident.severity],
    incident,
  }));
}

/** X-axis tick granularity for a query, reusing the temperature chart's
 *  range-to-format mapping (a date spans one 24h day). */
export function incidentXTickFormat(query: IncidentTimelineQuery): (t: number) => string {
  return 'date' in query ? xTickFormatForRange(24) : xTickFormatForRange(query.hours);
}
