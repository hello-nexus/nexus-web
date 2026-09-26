// Pure-ish helpers for the privacy-access indicators shown on
// ProcessListSection rows, ProcessDetailPanel's privacy section, and
// PrivacyHistoryModal (webcam/microphone/location/screen capture). Home for
// the icon map and time formatter every consumer shares, so none of them
// import each other. Mirrors metricHistoryHelpers.ts's approach.
import type { ComponentType } from 'react';
import { MapPin, Mic, ScreenShare, Webcam } from 'lucide-react';
import type { PrivacyCapability, PrivacySession } from '../../../../api/monitoringPrivacy';
import { formatDateTime, hour12OptionFor, type DateFormat, type TimeFormat } from '../../../../lib/units';

/** Both graphicsCapture* capabilities collapse onto one 'screen' icon - the
 *  distinction still shows up per-session in a tooltip via the capability
 *  itself, just not as a separate icon. */
export type PrivacyIconKind = 'webcam' | 'microphone' | 'location' | 'screen';

const ICON_KIND_BY_CAPABILITY: Record<PrivacyCapability, PrivacyIconKind> = {
  webcam: 'webcam',
  microphone: 'microphone',
  location: 'location',
  graphicsCaptureProgrammatic: 'screen',
  graphicsCaptureWithoutBorder: 'screen',
};

export function iconKindForCapability(capability: PrivacyCapability): PrivacyIconKind {
  return ICON_KIND_BY_CAPABILITY[capability];
}

export const PRIVACY_ICONS: Record<PrivacyIconKind, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  webcam: Webcam,
  microphone: Mic,
  location: MapPin,
  screen: ScreenShare,
};

export function formatPrivacyTime(ms: number, timeFormat: TimeFormat): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit', hour12: hour12OptionFor(timeFormat),
  });
}

/** Same as formatPrivacyTime but with the calendar date too - PrivacyHistoryModal
 *  spans many days, where a bare time (as the live indicators show) would be
 *  ambiguous about which day it refers to. */
export function formatPrivacyDateTime(ms: number, dateFormat: DateFormat, timeFormat: TimeFormat): string {
  return formatDateTime(new Date(ms), dateFormat, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    hour12: hour12OptionFor(timeFormat),
  }, { variant: 'short' });
}

/** A session ended within this long ago still shows on the row, dimmed. */
export const RECENT_WINDOW_MS = 3_600_000;

/** Basename of a win32 path, extension stripped, lowercased. A package
 *  family name (no path separator) has no basename - returns null, so a PFN
 *  session never matches a process row: PFN Store-app host processes have no
 *  reliable relationship to the PFN string itself. */
function pathBasenameNoExt(app: string): string | null {
  if (!app.includes('\\') && !app.includes('/')) return null;
  const file = app.split(/[\\/]/).pop();
  if (!file) return null;
  return file.replace(/\.[^.]+$/, '').toLowerCase();
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '').toLowerCase();
}

/** True when a privacy session's `app` (a full win32 exe path, or a package
 *  family name) identifies the same process as `processName` (the name
 *  ProcessListSection rows are keyed by). */
export function matchSessionApp(app: string, processName: string): boolean {
  const base = pathBasenameNoExt(app);
  if (base === null) return false;
  return base === stripExt(processName);
}

export interface PrivacyIndicator {
  kind: PrivacyIconKind;
  /** 'active' if any of this kind's sessions are still in use, else 'recent'. */
  state: 'active' | 'recent';
  /** This kind's sessions that are active or ended within RECENT_WINDOW_MS,
   *  newest first (an active session sorts as newest). */
  sessions: readonly PrivacySession[];
}

const ICON_ORDER: readonly PrivacyIconKind[] = ['webcam', 'microphone', 'location', 'screen'];

/** Newest first: an in-use session (end null) always sorts above every ended
 *  one (Infinity beats any real end timestamp), then by end descending, then
 *  by start descending. Shared by privacyIndicatorsForProcess's per-kind
 *  grouping and sortSessionsNewestFirst's whole-history ordering. */
function byRecency(a: PrivacySession, b: PrivacySession): number {
  return (b.end ?? Infinity) - (a.end ?? Infinity) || b.start - a.start;
}

/** Every session across every app, most recent first - PrivacyHistoryModal's
 *  ordering (unlike privacyIndicatorsForProcess, not scoped to one process
 *  or a recent-activity window). */
export function sortSessionsNewestFirst(sessions: readonly PrivacySession[]): PrivacySession[] {
  return [...sessions].sort(byRecency);
}

/** Human-readable app identity derived from a session's `app` (a full win32
 *  exe path, or a Store package family name) - the row label and the name fed
 *  to ProcessIcon for PrivacyHistoryModal. A win32 path yields the same
 *  extension-stripped basename a live process row would show, so a
 *  still-running app resolves the identical icon/name; an exited app's path
 *  no longer resolves an icon (ProcessIcon requires a live process to look
 *  one up) and falls back to its neutral-dot state on its own. A package
 *  family name (e.g. "Microsoft.WindowsMaps_8wekyb3d8bbwe") has no live-
 *  process relationship at all (see matchSessionApp) - the publisher-id
 *  suffix after the last underscore is dropped since it carries no readable
 *  identity. */
export function appDisplayName(app: string): string {
  if (app.includes('\\') || app.includes('/')) {
    const file = app.split(/[\\/]/).pop() ?? app;
    return file.replace(/\.[^.]+$/, '');
  }
  const underscoreIndex = app.lastIndexOf('_');
  return underscoreIndex > 0 ? app.slice(0, underscoreIndex) : app;
}

/** Case-insensitive substring match against each session's derived display
 *  name - PrivacyHistoryModal's search box. An empty/whitespace-only query
 *  returns every session, in their given order. */
export function filterSessionsByAppName(sessions: readonly PrivacySession[], query: string): PrivacySession[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...sessions];
  return sessions.filter(s => appDisplayName(s.app).toLowerCase().includes(needle));
}

/**
 * The privacy indicators to show on one process row: groups `sessions`
 * matching `processName` by icon kind, keeping only sessions that are
 * active or ended within RECENT_WINDOW_MS (older sessions don't surface on
 * the row at all). Returned in a stable kind order, sessions within each
 * group newest-first.
 */
export function privacyIndicatorsForProcess(
  sessions: readonly PrivacySession[],
  processName: string,
  nowMs: number,
): PrivacyIndicator[] {
  const groups = new Map<PrivacyIconKind, PrivacySession[]>();
  for (const s of sessions) {
    if (!matchSessionApp(s.app, processName)) continue;
    const recent = s.end === null || nowMs - s.end <= RECENT_WINDOW_MS;
    if (!recent) continue;
    const kind = iconKindForCapability(s.capability);
    const list = groups.get(kind);
    if (list) list.push(s); else groups.set(kind, [s]);
  }

  const indicators: PrivacyIndicator[] = [];
  for (const kind of ICON_ORDER) {
    const group = groups.get(kind);
    if (!group || group.length === 0) continue;
    const state: 'active' | 'recent' = group.some(s => s.end === null) ? 'active' : 'recent';
    const sorted = [...group].sort(byRecency);
    indicators.push({ kind, state, sessions: sorted });
  }
  return indicators;
}
