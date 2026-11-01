import { checkOnce, extractAssets, liveDeps, loadedEntry, reloadForBuild, type CheckResult } from './buildReloadWatcher';

// A lazy import or stylesheet preload fails either because a service update
// swapped the hashed assets (a new build) or because one fetch missed
// transiently on the same build. Either way a reload repairs the route, but
// only once index.html and every asset it references are fetchable: a stopped
// service or a deploy caught mid-copy must not turn into a reload onto an
// error page with no JS left to recover. Reloads are rate-limited per tab and
// never happen when their stamp cannot be stored.
const STAMP_KEY = 'nexus_stale_chunk_reload_at';
const SAME_STAMP_KEY = 'nexus_stale_chunk_same_reload_at';
export const STALE_CHUNK_RELOAD_LOCK_MS = 60_000;
// A stalled service or tunnel never settles the check's fetches; give up so the
// caller reports the error instead of dropping it.
export const STALE_CHUNK_CHECK_TIMEOUT_MS = 10_000;

const STALE_CHUNK_RE = /Failed to fetch dynamically imported module|Unable to preload CSS|error loading dynamically imported module|Importing a module script failed/i;

export function isStaleChunkMessage(message: string): boolean {
  return STALE_CHUNK_RE.test(message);
}

// WebKit's "Importing a module script failed." carries no URL, which leaves 'same' final.
export function staleChunkAssetPath(message: string, pageHref: string): string | null {
  const raw = /(?:Unable to preload CSS for|dynamically imported module:)\s*(\S+)/i.exec(message)?.[1];
  if (!raw) return null;
  try {
    const page = new URL(pageHref);
    const url = new URL(raw, page);
    return url.origin === page.origin && url.pathname.startsWith('/assets/') ? url.pathname : null;
  } catch {
    return null;
  }
}

// Waits between check attempts. A service restarting during an update refuses
// connections for a few seconds, so a first miss is retried before giving up.
export const STALE_CHUNK_RETRY_DELAYS_MS = [10_000, 20_000];

// Why a recovery did not reload; the first value is the only success.
export type RecoverOutcome = 'reloaded' | CheckResult | 'loop-guard' | 'timeout' | 'check-error' | 'storage-blocked' | 'asset-missing' | 'asset-unreachable' | 'same-build-guard';

export type ProbeResult = 'ok' | 'missing' | 'unreachable';

// A same-build failure recurring inside this window after a reload is real, so it is reported instead of reloading again.
export const SAME_BUILD_RELOAD_LOCK_MS = 10 * 60_000;

// Transient causes only: a final one ('disabled', 'same', 'locked') would just wait for nothing.
const RETRYABLE: ReadonlySet<RecoverOutcome> = new Set<RecoverOutcome>(['noop', 'no-entry', 'unverified', 'timeout', 'asset-unreachable']);

export interface RecoverDeps {
  // A function: a retried recovery reloads tens of seconds after it started, and the loop guard must stamp that moment.
  now: () => number;
  // The build watcher's pass without its own reload: resolves 'reload' only
  // when a new build is served and all its assets are present.
  check: () => Promise<CheckResult>;
  readStamp: () => number;
  // False when the stamp could not be stored.
  writeStamp: (at: number) => boolean;
  readSameStamp: () => number;
  writeSameStamp: (at: number) => boolean;
  // Whether the failed asset is served right now; aborts the request when the signal fires.
  probe: (path: string, signal: AbortSignal) => Promise<ProbeResult>;
  // Whether index.html and every asset it references are served right now.
  entryOk: () => Promise<boolean>;
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

async function probeAssets(deps: RecoverDeps, paths: string[]): Promise<ProbeResult[]> {
  return Promise.all(paths.map(async (path): Promise<ProbeResult> => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        deps.probe(path, abort.signal),
        new Promise<ProbeResult>((resolve) => {
          timer = setTimeout(() => { abort.abort(); resolve('unreachable'); }, STALE_CHUNK_CHECK_TIMEOUT_MS);
        }),
      ]);
    } catch {
      return 'unreachable';
    } finally {
      clearTimeout(timer);
    }
  }));
}

async function entryOkWithTimeout(deps: RecoverDeps): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      deps.entryOk(),
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), STALE_CHUNK_CHECK_TIMEOUT_MS); }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// 'reloaded' when a reload was triggered, so the caller can swallow the error;
// otherwise the reason it was not, and the error should surface as a real failure.
export async function recoverFromStaleChunk(deps: RecoverDeps, assets: () => string[] = () => []): Promise<RecoverOutcome> {
  const last = deps.readStamp();
  if (last > 0 && deps.now() >= last && deps.now() - last < STALE_CHUNK_RELOAD_LOCK_MS) return 'loop-guard';
  let result: RecoverOutcome = 'noop';
  let sameBuild = false;
  for (let attempt = 0; attempt <= STALE_CHUNK_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await deps.sleep(STALE_CHUNK_RETRY_DELAYS_MS[attempt - 1]);
    sameBuild = false;
    const checked = await checkWithTimeout(deps);
    result = checked === 'reload' ? 'reloaded' : checked;
    const paths = result === 'same' ? [...new Set(assets())] : [];
    if (paths.length > 0) {
      const probed = await probeAssets(deps, paths);
      if (probed.includes('missing')) result = 'asset-missing';
      else if (probed.includes('unreachable')) result = 'asset-unreachable';
      // Chrome names the top-level chunk even when a nested static dep is the missing one, so the whole entry is checked too.
      else if (!(await entryOkWithTimeout(deps))) result = 'asset-unreachable';
      // Vite's preload helper never retries a failed stylesheet and a failed React.lazy stays rejected, so only a reload repairs the route.
      else { result = 'reloaded'; sameBuild = true; }
    }
    if (!RETRYABLE.has(result)) break;
  }
  if (result !== 'reloaded') return result;
  if (sameBuild) {
    const at = deps.readSameStamp();
    if (at > 0 && deps.now() >= at && deps.now() - at < SAME_BUILD_RELOAD_LOCK_MS) return 'same-build-guard';
    if (!deps.writeSameStamp(deps.now())) return 'storage-blocked';
  }
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
    readSameStamp: () => {
      try { return Number(sessionStorage.getItem(SAME_STAMP_KEY) ?? 0) || 0; } catch { return 0; }
    },
    writeSameStamp: (at) => {
      try { sessionStorage.setItem(SAME_STAMP_KEY, String(at)); return true; } catch { return false; }
    },
    entryOk: async () => {
      if (!loaded) return false;
      try {
        const deps = liveDeps(loaded);
        const res = await deps.fetchText('/index.html');
        return res.ok && await deps.assetsOk(extractAssets(res.text));
      } catch {
        return false;
      }
    },
    probe: async (path, signal) => {
      try {
        const r = await fetch(path, { method: 'HEAD', cache: 'no-store', signal });
        if (r.ok) return 'ok';
        return r.status >= 500 ? 'unreachable' : 'missing';
      } catch {
        return 'unreachable';
      }
    },
    reload: reloadForBuild,
    sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
  };
}

// One recovery at a time: a burst of chunk errors (several lazy pages, the
// dashboard prefetches) shares a single index.html fetch and asset sweep.
let inFlight: Promise<RecoverOutcome> | null = null;
const pendingAssets = new Set<string>();

export function recoverFromStaleChunkNow(message = ''): Promise<RecoverOutcome> {
  const path = staleChunkAssetPath(message, window.location.href);
  if (path) pendingAssets.add(path);
  if (!inFlight) {
    inFlight = recoverFromStaleChunk(liveRecoverDeps(), () => [...pendingAssets]).finally(() => { inFlight = null; pendingAssets.clear(); });
  }
  return inFlight;
}
