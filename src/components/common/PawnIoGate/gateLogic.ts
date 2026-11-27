import type { PawnIoState, PawnIoStatus } from '../../../api/pawnio';

/** Which screen family a service state shows. */
export type PawnIoScreen = 'install' | 'restart' | 'notRunning' | 'blocked';

/**
 * Where the screen is in its own flow. idle is the entry screen; working,
 * done and failed follow a fix attempt; restartLater follows "I'll restart
 * later"; stillBlocked follows a Check again that found the driver blocked.
 */
export type PawnIoPhase = 'idle' | 'working' | 'done' | 'failed' | 'restartLater' | 'stillBlocked';

/** The gate shows only for a state the service positively reported as not ok. */
export function gateShows(status: PawnIoStatus | null): boolean {
  return status !== null && status.state !== 'ok';
}

export function screenFor(state: Exclude<PawnIoState, 'ok'>): PawnIoScreen {
  switch (state) {
    case 'notInstalled':
    case 'installFailed':
    case 'permissionDeclined':
      return 'install';
    case 'restartRequired':
      return 'restart';
    case 'notRunning':
      return 'notRunning';
    case 'blocked':
      return 'blocked';
  }
}

/**
 * Outcome of a fix attempt, from the status the service returned (null when
 * the request itself failed). A new not-ok state replaces the screen; the
 * same one means the fix did not take, so the steps screen shows.
 */
export type FixOutcome =
  | { kind: 'done' }
  | { kind: 'failed' }
  | { kind: 'moved'; status: PawnIoStatus };

export function fixOutcome(before: PawnIoState, after: PawnIoStatus | null): FixOutcome {
  if (!after) return { kind: 'failed' };
  if (after.state === 'ok') return { kind: 'done' };
  const wasInstall = before === 'notInstalled' || before === 'installFailed' || before === 'permissionDeclined';
  const nowInstall = after.state === 'notInstalled' || after.state === 'installFailed' || after.state === 'permissionDeclined';
  // permissionDeclined is a new answer for the install screen (it adds the
  // permission note); a plain repeat of the same family is a failed attempt.
  if (after.state === 'permissionDeclined' && before !== 'permissionDeclined') return { kind: 'moved', status: after };
  if (after.state === before || (wasInstall && nowInstall)) return { kind: 'failed' };
  return { kind: 'moved', status: after };
}

/**
 * Dev-tools previews: every `?pawnioPreview=<id>` value, with the status the
 * real components render and the phase the screen starts in.
 */
export interface PawnIoPreview {
  status: PawnIoStatus;
  phase: PawnIoPhase;
}

function previewStatus(state: PawnIoState, fixAction: PawnIoStatus['fixAction'], installed: boolean): PawnIoStatus {
  return { installed, open: false, state, errorCode: null, fixAction, fixing: false };
}

const PREVIEWS: Record<string, PawnIoPreview> = {
  notInstalled: { status: previewStatus('notInstalled', 'install', false), phase: 'idle' },
  installFailed: { status: previewStatus('installFailed', 'install', false), phase: 'idle' },
  permissionDeclined: { status: previewStatus('permissionDeclined', 'install', false), phase: 'idle' },
  installing: { status: previewStatus('notInstalled', 'install', false), phase: 'working' },
  installed: { status: previewStatus('notInstalled', 'install', false), phase: 'done' },
  restartRequired: { status: previewStatus('restartRequired', 'restart', true), phase: 'idle' },
  restartLater: { status: previewStatus('restartRequired', 'restart', true), phase: 'restartLater' },
  notRunning: { status: previewStatus('notRunning', 'repair', true), phase: 'idle' },
  fixing: { status: previewStatus('notRunning', 'repair', true), phase: 'working' },
  fixFailed: { status: previewStatus('notRunning', 'repair', true), phase: 'failed' },
  blocked: { status: previewStatus('blocked', 'none', true), phase: 'idle' },
  stillBlocked: { status: previewStatus('blocked', 'none', true), phase: 'stillBlocked' },
};

export const PAWNIO_PREVIEW_IDS: readonly string[] = Object.keys(PREVIEWS);

export const PAWNIO_PREVIEW_PARAM = 'pawnioPreview';

export function previewFor(id: string | null): PawnIoPreview | null {
  return id && Object.prototype.hasOwnProperty.call(PREVIEWS, id) ? PREVIEWS[id] : null;
}

export function previewHref(id: string): string {
  return `/?${PAWNIO_PREVIEW_PARAM}=${encodeURIComponent(id)}`;
}
