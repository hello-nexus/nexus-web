import { describe, expect, it } from 'vitest';
import type { AppTelemetryEvent } from '../../api/appTelemetry';
import { appIds, eventLabel, filterByApp, propertiesText } from './appTelemetryUtils';

const ev = (event: string, properties: AppTelemetryEvent['properties']): AppTelemetryEvent => ({ at: '2026-10-03T10:00:00Z', event, properties });
const events = [
  ev('app_event', { app_id: 'b.app', app_version: '1.0.0', event: 'level_done', surface: 'page', dev_tools: true, p_level: 3 }),
  ev('app_page_opened', { app_id: 'a.app' }),
  ev('app_page_closed', { app_id: 'b.app', duration_ms: 1200 }),
];

describe('appTelemetryUtils', () => {
  it('lists distinct app ids sorted', () => {
    expect(appIds(events)).toEqual(['a.app', 'b.app']);
  });

  it('filters by app and keeps all for an empty filter', () => {
    expect(filterByApp(events, 'a.app')).toHaveLength(1);
    expect(filterByApp(events, '')).toHaveLength(3);
  });

  it('labels app_event with the app event name only', () => {
    expect(eventLabel(events[0])).toBe('app_event (level_done)');
    expect(eventLabel(events[1])).toBe('app_page_opened');
  });

  it('renders properties without app_id and without the folded event name', () => {
    expect(propertiesText(events[0])).toBe('app_version=1.0.0 surface=page dev_tools=true p_level=3');
    expect(propertiesText(events[1])).toBe('');
    expect(propertiesText(events[2])).toBe('duration_ms=1200');
  });
});
