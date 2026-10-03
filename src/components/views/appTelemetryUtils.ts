import type { AppTelemetryEvent } from '../../api/appTelemetry';

export function eventAppId(e: AppTelemetryEvent): string {
  const id = e.properties.app_id;
  return typeof id === 'string' ? id : '';
}

/** Sorted distinct app ids, for the filter. */
export function appIds(events: readonly AppTelemetryEvent[]): string[] {
  return [...new Set(events.map(eventAppId).filter(Boolean))].sort();
}

/** An empty filter keeps everything. */
export function filterByApp(events: readonly AppTelemetryEvent[], appId: string): AppTelemetryEvent[] {
  return appId ? events.filter(e => eventAppId(e) === appId) : [...events];
}

/** app_event shows the app's own event name, since every app event shares one PostHog name. */
export function eventLabel(e: AppTelemetryEvent): string {
  const own = e.properties.event;
  return e.event === 'app_event' && typeof own === 'string' ? `${e.event} (${own})` : e.event;
}

/** The properties as `key=value` text; app_id has its own column and event is folded into the label. */
export function propertiesText(e: AppTelemetryEvent): string {
  return Object.entries(e.properties)
    .filter(([k]) => k !== 'app_id' && !(k === 'event' && e.event === 'app_event'))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' ');
}
