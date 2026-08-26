import { formatDuration } from '../../../../lib/formatDuration';
import type { MonitoringEventKind, TimelineEvent } from '../../../../api/monitoringEvents';
import { hour12OptionFor, type TimeFormat } from '../../../../lib/units';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Translated name for an event kind, shared by the chart tooltip, the events
 *  modal, and the per-kind settings rows so the three cannot drift. */
export function eventKindLabel(t: Translate, kind: MonitoringEventKind): string {
  return t(`monitoring.events.kind.${kind}`);
}

/** Clock time for an event marker. Always carries seconds: an event is a
 *  specific instant, finer than the x-axis ticks it sits above. */
export function formatEventTime(t: number, timeFormat: TimeFormat): string {
  return new Date(t).toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: hour12OptionFor(timeFormat),
  });
}

/** "in use for 3m 12s" for a finished privacy session, "in use now" while the
 *  capability is still held (endT null). */
export function formatPrivacyDuration(t: Translate, startT: number, endT: number | null): string {
  if (endT === null) return t('monitoring.events.inUseNow');
  return t('monitoring.events.inUseFor', { duration: formatDuration(Math.max(0, endT - startT)) });
}

/** Tooltip body for a marker: what happened, to what, and when. */
export function eventTooltipText(t: Translate, event: TimelineEvent, timeFormat: TimeFormat): string {
  const when = formatEventTime(event.t, timeFormat);
  const kind = eventKindLabel(t, event.kind);
  if (event.kind.startsWith('privacy-')) {
    return `${kind} · ${event.label} · ${formatPrivacyDuration(t, event.t, event.endT)} · ${when}`;
  }
  return `${kind} · ${event.label} · ${when}`;
}
