import { checkOnce, liveDeps, loadedEntry, type CheckResult } from './buildReloadWatcher';

// A service update swaps the hashed assets under an already-open page, so the
// next lazy import or stylesheet preload of a removed chunk fails. Reloading
// picks up the new entry, but only once the build watcher's check confirms a
// different entry is served and every asset it references is fetchable: a
// stopped service or a deploy caught mid-copy must not turn into a blind
// reload. At most one reload happens per window, and none when the loop-guard
// stamp cannot be stored.
const STAMP_KEY = 'nexus_stale_chunk_reload_at';
export const STALE_CHUNK_RELOAD_LOCK_MS = 60_000;
// A stalled service or tunnel never settles the check's fetches; give up so the
// caller reports the error instead of dropping it.
export const STALE_CHUNK_CHECK_TIMEOUT_MS = 10_000;

const STALE_CHUNK_RE = /Failed to fetch dynamically imported module|Unable to preload CSS|error loading dynamically imported module|Importing a module script failed/i;

export function isStaleChunkMessage(message: string): boolean {
  return STALE_CHUNK_RE.test(message);
}

// Waits between check attempts. A service restarting during an update refuses
// connections for a few seconds, so a first miss is retried before giving up.
export const STALE_CHUNK_RETRY_DELAYS_MS = [10_000, 20_000];

// Why a recovery did not reload; the first value is the only success.
export type RecoverOutcome = 'reloaded' | CheckResult | 'loop-guard' | 'timeout' | 'check-error' | 'storage-blocked';

// Transient causes only: a final one ('disabled', 'same', 'locked') would just wait for nothing.
const RETRYABLE: ReadonlySet<RecoverOutcome> = new Set<RecoverOutcome>(['noop', 'no-entry', 'unverified', 'timeout']);

export interface RecoverDeps {
  // A function: a retried recovery reloads tens of seconds after it started, and the loop guard must stamp that moment.
  now: () => number;
  // The build watcher's pass without its own reload: resolves 'reload' only
  // when a new build is served and all its assets are present.
  check: () => Promise<CheckResult>;
  readStamp: () => number;
  // False when the stamp could not be stored.
  writeStamp: (at: number) => boolean;
  reload: () => void;
  sleep: (ms: number) => Promise<void>;
}

async function checkWithTimeout(deps: RecoverDeps): Promise<CheckResult | 'timeout' | 'check-error'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      deps.check(),
      new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), STALE_CHUNK_CHECK_TIMEOUT_MS); }),
    ]);
  } catch {
    return 'check-error';
  } finally {
    clearTimeout(timer);
  }
}

// 'reloaded' when a reload was triggered, so the caller can swallow the error;
// otherwise the reason it was not, and the error should surface as a real failure.
export async function recoverFromStaleChunk(deps: RecoverDeps): Promise<RecoverOutcome> {
  const last = deps.readStamp();
  if (last > 0 && deps.now() >= last && deps.now() - last < STALE_CHUNK_RELOAD_LOCK_MS) return 'loop-guard';
  let result: RecoverOutcome = 'noop';
  for (let attempt = 0; attempt <= STALE_CHUNK_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await deps.sleep(STALE_CHUNK_RETRY_DELAYS_MS[attempt - 1]);
    const checked = await checkWithTimeout(deps);
    result = checked === 'reload' ? 'reloaded' : checked;
    if (!RETRYABLE.has(result)) break;
  }
  if (result !== 'reloaded') return result;
  if (!deps.writeStamp(deps.now())) return 'storage-blocked';
  deps.reload();
  return 'reloaded';
}

export function liveRecoverDeps(): RecoverDeps {
  const loaded = loadedEntry();
  return {
    now: () => Date.now(),
    check: () => (loaded ? checkOnce({ ...liveDeps(loaded), reload: () => {} }) : Promise.resolve<CheckResult>('disabled')),
    readStamp: () => {
      try { return Number(sessionStorage.getItem(STAMP_KEY) ?? 0) || 0; } catch { return 0; }
    },
    writeStamp: (at) => {
      try { sessionStorage.setItem(STAMP_KEY, String(at)); return true; } catch { return false; }
    },
    reload: () => window.location.reload(),
    sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
  };
}

// One recovery at a time: a burst of chunk errors (several lazy pages, the
// dashboard prefetches) shares a single index.html fetch and asset sweep.
let inFlight: Promise<RecoverOutcome> | null = null;

export function recoverFromStaleChunkNow(): Promise<RecoverOutcome> {
  if (!inFlight) {
    inFlight = recoverFromStaleChunk(liveRecoverDeps()).finally(() => { inFlight = null; });
  }
  return inFlight;
}
