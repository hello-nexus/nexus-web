// Pure helpers for the privacy-access indicators shown on ProcessListSection
// rows (webcam/microphone/location/screen capture). Kept side-effect-free (no
// i18n context, no fetch) so they're covered directly by
// privacyHelpers.test.ts instead of through component rendering. Mirrors
// metricHistoryHelpers.ts's approach.
import type { PrivacyCapability, PrivacySession } from '../../../../api/monitoringPrivacy';

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
    const sorted = [...group].sort((a, b) => (b.end ?? Infinity) - (a.end ?? Infinity) || b.start - a.start);
    indicators.push({ kind, state, sessions: sorted });
  }
  return indicators;
}
