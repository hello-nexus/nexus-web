// Contract-shaped fixture for GET /monitoring/privacy, used only as a dev-
// build fallback while the service route is still being built. Every session
// is positioned relative to the requested `to` (never a fixed anchor date),
// so a query for "now" always returns a plausible, still-fresh mix - one
// capability currently in use (end: null) plus a few recently ended ones.

import type { PrivacyCapability, PrivacyQuery, PrivacyResponse, PrivacySession } from './monitoringPrivacy';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const RETENTION_DAYS = 7;

interface SessionTemplate {
  app: string;
  capability: PrivacyCapability;
  startBeforeToMs: number;
  /** null keeps the session active (end: null) at the requested `to`. */
  endBeforeToMs: number | null;
}

const TEMPLATES: readonly SessionTemplate[] = [
  { app: 'C:\\Program Files\\Microsoft\\Teams\\current\\Teams.exe', capability: 'microphone', startBeforeToMs: 22 * MINUTE_MS, endBeforeToMs: null },
  { app: 'C:\\Program Files\\Microsoft\\Teams\\current\\Teams.exe', capability: 'webcam', startBeforeToMs: 22 * MINUTE_MS, endBeforeToMs: null },
  { app: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', capability: 'webcam', startBeforeToMs: 3 * HOUR_MS, endBeforeToMs: 2 * HOUR_MS + 41 * MINUTE_MS },
  { app: 'C:\\Windows\\System32\\SnippingTool.exe', capability: 'graphicsCaptureWithoutBorder', startBeforeToMs: 55 * MINUTE_MS, endBeforeToMs: 54 * MINUTE_MS },
  { app: 'C:\\Program Files\\Nexus\\Nexus.exe', capability: 'graphicsCaptureProgrammatic', startBeforeToMs: 12 * MINUTE_MS, endBeforeToMs: 9 * MINUTE_MS },
  { app: 'Microsoft.WindowsMaps_8wekyb3d8bbwe', capability: 'location', startBeforeToMs: 5 * HOUR_MS, endBeforeToMs: 4 * HOUR_MS + 50 * MINUTE_MS },
];

export function mockMonitoringPrivacy(query: PrivacyQuery): PrivacyResponse {
  const from = Math.min(query.from, query.to);
  const to = Math.max(query.from, query.to);
  const sessions: PrivacySession[] = TEMPLATES
    .map(t => ({
      app: t.app,
      capability: t.capability,
      start: to - t.startBeforeToMs,
      end: t.endBeforeToMs === null ? null : to - t.endBeforeToMs,
    }))
    .filter(s => (s.end ?? to) >= from && s.start <= to);
  return { supported: true, retentionDays: RETENTION_DAYS, sessions };
}
