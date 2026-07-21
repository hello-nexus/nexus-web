// Contract-shaped fixture for /monitoring/events, used only as a dev-build
// fallback while the service route is still being built. Every template
// event is positioned relative to the requested `to` (never a fixed anchor
// date), same convention as monitoringPrivacyMock.ts. Created/deleted custom
// events persist in a module-level array for the life of the dev session, so
// the "+"-on-selection flow and the events modal's remove action round-trip
// realistically without a live service.

import type { MonitoringEventDto, MonitoringEventsResponse } from './monitoringEvents';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

interface EventTemplate {
  kind: 'app-open' | 'uac-escalation' | 'usb-attach' | 'usb-detach';
  label: string;
  detail: string | null;
  beforeToMs: number;
}

const TEMPLATES: readonly EventTemplate[] = [
  { kind: 'app-open', label: 'Discord.exe', detail: 'C:\\Users\\Example\\AppData\\Local\\Discord\\Discord.exe', beforeToMs: 4 * MINUTE_MS },
  { kind: 'uac-escalation', label: 'RegistryFixTool.exe', detail: 'C:\\Tools\\RegistryFixTool.exe', beforeToMs: 18 * MINUTE_MS },
  { kind: 'usb-attach', label: 'Logitech G502', detail: '046D:C09D', beforeToMs: 32 * MINUTE_MS },
  { kind: 'usb-detach', label: 'SanDisk USB Drive', detail: '0781:5583', beforeToMs: 47 * MINUTE_MS },
  { kind: 'app-open', label: 'Steam.exe', detail: 'C:\\Program Files (x86)\\Steam\\Steam.exe', beforeToMs: 90 * MINUTE_MS },
  { kind: 'usb-attach', label: 'Elgato Stream Deck', detail: '0FD9:0080', beforeToMs: 2 * HOUR_MS },
];

// Negative so a mock template id can never collide with a mock-created
// custom event's positive id.
function templateId(index: number): number {
  return -(index + 1);
}

let nextMockCustomId = 1;
const mockCustomEvents: MonitoringEventDto[] = [];

function templateEventsFor(from: number, to: number): MonitoringEventDto[] {
  return TEMPLATES
    .map((tpl, i): MonitoringEventDto => ({
      id: templateId(i),
      t: to - tpl.beforeToMs,
      kind: tpl.kind,
      label: tpl.label,
      detail: tpl.detail,
      custom: false,
    }))
    .filter(e => e.t >= from && e.t <= to);
}

export function mockMonitoringEvents(query: { from: number; to: number; limit?: number }): MonitoringEventsResponse {
  const from = Math.min(query.from, query.to);
  const to = Math.max(query.from, query.to);
  const events = [...templateEventsFor(from, to), ...mockCustomEvents.filter(e => e.t >= from && e.t <= to)]
    .sort((a, b) => a.t - b.t);
  const limit = Math.max(1, Math.min(2000, query.limit ?? 500));
  return { events: events.slice(-limit) };
}

export function mockCreateCustomEvent(t: number, label: string): MonitoringEventDto {
  const trimmed = label.trim().slice(0, 120);
  const event: MonitoringEventDto = { id: nextMockCustomId++, t, kind: 'custom', label: trimmed, detail: null, custom: true };
  mockCustomEvents.push(event);
  return event;
}

export function mockDeleteCustomEvent(id: number): boolean {
  const idx = mockCustomEvents.findIndex(e => e.id === id);
  if (idx === -1) return false;
  mockCustomEvents.splice(idx, 1);
  return true;
}
