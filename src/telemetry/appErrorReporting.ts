import { getMarketplaceListing } from '../widgets/marketplaceRegistry';
import { fingerprintOf, reportError } from './errorReporting';

export type AppErrorPath =
  | 'worker-error'
  | 'boot-error'
  | 'unhandled-rejection'
  | 'render-failed'
  | 'canvas-error'
  | 'boundary'
  | 'callback-error'
  | 'boot-timeout'
  | 'log-error';

const COOLDOWN_MS = 10 * 60 * 1000;
const MAX_PER_APP = 20;
const MAX_TRACKED = 500;
const MESSAGE_CAP = 500;

const lastSeen = new Map<string, number>();
const appWindows = new Map<string, { start: number; count: number }>();

function toError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : String((error as { message?: unknown } | null)?.message ?? error);
  if (error instanceof Error && raw.length <= MESSAGE_CAP) return error;
  const err = new Error(raw.length > MESSAGE_CAP ? raw.slice(0, MESSAGE_CAP) : raw);
  err.name = error instanceof Error ? error.name : 'AppError';
  if (error instanceof Error) err.stack = error.stack;
  return err;
}

function surfaceOf(): string {
  try {
    const path = window.location.pathname;
    return path === '/panel' || path === '/touch' || path.startsWith('/panel/') ? 'panel' : 'desktop';
  } catch {
    return 'desktop';
  }
}

// Repeats of one fingerprint are dropped for the cooldown, and an app past MAX_PER_APP distinct reports per window is muted,
// so an app throwing on every tick costs one report.
function admit(appId: string, fingerprint: string, now: number): boolean {
  const key = `${appId}|${fingerprint}`;
  const prev = lastSeen.get(key);
  if (prev !== undefined && now >= prev && now - prev < COOLDOWN_MS) return false;
  let win = appWindows.get(appId);
  if (!win || now < win.start || now - win.start >= COOLDOWN_MS) {
    win = { start: now, count: 0 };
    appWindows.set(appId, win);
  }
  if (win.count >= MAX_PER_APP) return false;
  win.count += 1;
  if (lastSeen.size >= MAX_TRACKED) lastSeen.clear();
  lastSeen.set(key, now);
  return true;
}

/** Reports an error raised by an SDK app (worker, renderer or host-side render) as kind 'app'; an author's own nexus.log('error') text is kind 'app-log', which the service logs locally and never uploads. Both carry the app id, listing version and surface. */
export function reportAppError(appId: string, path: AppErrorPath, error: unknown): void {
  try {
    const err = toError(error);
    if (!admit(appId, fingerprintOf(err.name, err.message), Date.now())) return;
    const version = getMarketplaceListing(appId)?.version ?? 'unknown';
    const surface = surfaceOf();
    const tag = `${appId}@${version} ${surface} ${path}`;
    reportError(err, path === 'log-error' ? 'app-log' : 'app', `app=${appId}@${version} surface=${surface} path=${path}`, true, { id: appId, tag });
  } catch {
    return;
  }
}

export function resetAppErrorReportingForTests(): void {
  lastSeen.clear();
  appWindows.clear();
}
