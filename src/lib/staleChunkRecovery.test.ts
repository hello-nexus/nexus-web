import { afterEach, describe, expect, it, vi } from 'vitest';

const watcher = vi.hoisted(() => ({
  reload: vi.fn(),
  passedReload: null as null | (() => void),
  checkOnce: vi.fn(),
}));
vi.mock('./buildReloadWatcher', () => ({
  loadedEntry: () => '/assets/index-abc.js',
  reloadForBuild: () => {},
  liveDeps: () => ({ loaded: '/assets/index-abc.js', reload: watcher.reload }),
  checkOnce: (deps: { reload: () => void }) => {
    watcher.passedReload = deps.reload;
    return watcher.checkOnce();
  },
}));

import {
  isStaleChunkMessage,
  SAME_BUILD_RELOAD_LOCK_MS,
  staleChunkAssetPath,
  liveRecoverDeps,
  recoverFromStaleChunk,
  recoverFromStaleChunkNow,
  STALE_CHUNK_CHECK_TIMEOUT_MS,
  STALE_CHUNK_RETRY_DELAYS_MS,
  STALE_CHUNK_RELOAD_LOCK_MS,
  type RecoverDeps,
} from './staleChunkRecovery';

function makeDeps(over: Partial<RecoverDeps> & { stamp?: number } = {}) {
  const { stamp = 0, ...rest } = over;
  const deps = {
    now: () => 1_000_000,
    check: vi.fn(async () => 'reload' as const),
    readStamp: () => stamp,
    writeStamp: vi.fn(() => true),
    readSameStamp: () => 0,
    writeSameStamp: vi.fn(() => true),
    probe: vi.fn(async () => 'ok' as const),
    entryOk: vi.fn(async () => true),
    reload: vi.fn(),
    sleep: vi.fn(async () => {}),
    ...rest,
  };
  return deps as typeof deps & RecoverDeps;
}

describe('isStaleChunkMessage', () => {
  it('matches the dynamic import and CSS preload failures', () => {
    expect(isStaleChunkMessage('Failed to fetch dynamically imported module: http://localhost:9400/assets/DevicesPage-Bc.js')).toBe(true);
    expect(isStaleChunkMessage('Unable to preload CSS for /assets/MonitoringPage-Dy.css')).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isStaleChunkMessage('Cannot read properties of undefined')).toBe(false);
  });
});

describe('recoverFromStaleChunk', () => {
  it('reloads and stamps when the watcher check confirms a new build', async () => {
    const deps = makeDeps();
    expect(await recoverFromStaleChunk(deps)).toBe('reloaded');
    expect(deps.writeStamp).toHaveBeenCalledWith(1_000_000);
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it.each(['noop', 'disabled', 'no-entry', 'same', 'locked', 'unverified'] as const)('does not reload when the watcher check says %s', async (result) => {
    const deps = makeDeps({ check: vi.fn(async () => result) });
    expect(await recoverFromStaleChunk(deps)).toBe(result);
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('does not reload when the watcher check throws', async () => {
    const deps = makeDeps({ check: vi.fn(async () => { throw new Error('offline'); }) });
    expect(await recoverFromStaleChunk(deps)).toBe('check-error');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('does not reload when the loop-guard stamp cannot be stored', async () => {
    const deps = makeDeps({ writeStamp: vi.fn(() => false) });
    expect(await recoverFromStaleChunk(deps)).toBe('storage-blocked');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('does not check or reload again inside the lock window', async () => {
    const deps = makeDeps({ stamp: 1_000_000 - (STALE_CHUNK_RELOAD_LOCK_MS - 1) });
    expect(await recoverFromStaleChunk(deps)).toBe('loop-guard');
    expect(deps.check).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('reloads again once the window has passed', async () => {
    const deps = makeDeps({ stamp: 1_000_000 - STALE_CHUNK_RELOAD_LOCK_MS });
    expect(await recoverFromStaleChunk(deps)).toBe('reloaded');
  });
});

describe('recoverFromStaleChunk timeout', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('gives up on a check that never settles', async () => {
    vi.useFakeTimers();
    const deps = makeDeps({ check: vi.fn(() => new Promise<never>(() => {})) });
    const pending = recoverFromStaleChunk(deps);
    await vi.advanceTimersByTimeAsync(STALE_CHUNK_CHECK_TIMEOUT_MS * (STALE_CHUNK_RETRY_DELAYS_MS.length + 1));
    expect(await pending).toBe('timeout');
    expect(deps.reload).not.toHaveBeenCalled();
  });
});

describe('recoverFromStaleChunk retry', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('retries a noop check with the bounded backoff and reloads once the build is served', async () => {
    const check = vi.fn<RecoverDeps['check']>().mockResolvedValueOnce('noop').mockResolvedValueOnce('unverified').mockResolvedValueOnce('reload');
    const deps = makeDeps({ check });
    expect(await recoverFromStaleChunk(deps)).toBe('reloaded');
    expect(check).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenNthCalledWith(1, STALE_CHUNK_RETRY_DELAYS_MS[0]);
    expect(deps.sleep).toHaveBeenNthCalledWith(2, STALE_CHUNK_RETRY_DELAYS_MS[1]);
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last attempt and reports the final reason', async () => {
    const deps = makeDeps({ check: vi.fn(async () => 'noop' as const) });
    expect(await recoverFromStaleChunk(deps)).toBe('noop');
    expect(deps.check).toHaveBeenCalledTimes(STALE_CHUNK_RETRY_DELAYS_MS.length + 1);
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('retries a 200 without an entry like a transient miss', async () => {
    const check = vi.fn<RecoverDeps['check']>().mockResolvedValueOnce('no-entry').mockResolvedValueOnce('reload');
    const deps = makeDeps({ check });
    expect(await recoverFromStaleChunk(deps)).toBe('reloaded');
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('stamps the moment of the reload, not the start of the recovery', async () => {
    let t = 1_000_000;
    const deps = makeDeps({
      now: () => t,
      sleep: vi.fn(async (ms: number) => { t += ms; }),
      check: vi.fn<RecoverDeps['check']>().mockResolvedValueOnce('noop').mockResolvedValueOnce('reload'),
    });
    expect(await recoverFromStaleChunk(deps)).toBe('reloaded');
    expect(deps.writeStamp).toHaveBeenCalledWith(1_000_000 + STALE_CHUNK_RETRY_DELAYS_MS[0]);
  });

  it.each(['same', 'locked', 'disabled'] as const)('does not retry a definitive %s result', async (result) => {
    const deps = makeDeps({ check: vi.fn(async () => result) });
    expect(await recoverFromStaleChunk(deps)).toBe(result);
    expect(deps.check).toHaveBeenCalledTimes(1);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('retries after a timeout', async () => {
    vi.useFakeTimers();
    const check = vi.fn<RecoverDeps['check']>().mockReturnValueOnce(new Promise<never>(() => {})).mockResolvedValueOnce('reload');
    const deps = makeDeps({ check });
    const pending = recoverFromStaleChunk(deps);
    await vi.advanceTimersByTimeAsync(STALE_CHUNK_CHECK_TIMEOUT_MS);
    expect(await pending).toBe('reloaded');
  });

  it('does not retry the loop guard', async () => {
    const deps = makeDeps({ stamp: 1_000_000 });
    expect(await recoverFromStaleChunk(deps)).toBe('loop-guard');
    expect(deps.check).not.toHaveBeenCalled();
  });
});

describe('liveRecoverDeps', () => {
  it('runs the watcher check with its own reload disabled', async () => {
    watcher.reload.mockClear();
    watcher.checkOnce.mockResolvedValue('reload');
    expect(await liveRecoverDeps().check()).toBe('reload');
    watcher.passedReload?.();
    expect(watcher.reload).not.toHaveBeenCalled();
  });
});

describe('recoverFromStaleChunkNow', () => {
  it('shares one check across a burst of callers', async () => {
    let settle: (v: string) => void = () => {};
    watcher.checkOnce.mockReset();
    watcher.checkOnce.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    const calls = [recoverFromStaleChunkNow(), recoverFromStaleChunkNow(), recoverFromStaleChunkNow()];
    expect(watcher.checkOnce).toHaveBeenCalledTimes(1);
    settle('same');
    expect(await Promise.all(calls)).toEqual(['same', 'same', 'same']);
    watcher.checkOnce.mockResolvedValue('same');
    await recoverFromStaleChunkNow();
    expect(watcher.checkOnce).toHaveBeenCalledTimes(2);
  });
});

describe('staleChunkAssetPath', () => {
  const page = 'http://localhost:9400/system/dashboard';

  it('reads the CSS and module wordings', () => {
    expect(staleChunkAssetPath('Unable to preload CSS for /assets/DevicesPage-LG0.css', page)).toBe('/assets/DevicesPage-LG0.css');
    expect(staleChunkAssetPath('Failed to fetch dynamically imported module: http://localhost:9400/assets/CoolingPage-B.js', page)).toBe('/assets/CoolingPage-B.js');
  });

  it('ignores other origins, other paths and URL-less wordings', () => {
    expect(staleChunkAssetPath('Failed to fetch dynamically imported module: https://evil.example/assets/x.js', page)).toBeNull();
    expect(staleChunkAssetPath('Failed to fetch dynamically imported module: http://localhost:9400/other/x.js', page)).toBeNull();
    expect(staleChunkAssetPath('Importing a module script failed.', page)).toBeNull();
  });
});

describe('recoverFromStaleChunk on an unchanged build', () => {
  const same = () => vi.fn(async () => 'same' as const);
  const assets = () => ['/assets/DevicesPage-LG0.css'];

  it('reloads when the failed asset is served now, since a failed lazy import or stylesheet is never retried', async () => {
    const deps = makeDeps({ check: same() });
    expect(await recoverFromStaleChunk(deps, assets)).toBe('reloaded');
    expect(deps.probe).toHaveBeenCalledWith('/assets/DevicesPage-LG0.css', expect.any(AbortSignal));
    expect(deps.writeSameStamp).toHaveBeenCalledWith(1_000_000);
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it('reports a chunk the service really does not serve', async () => {
    const deps = makeDeps({ check: same(), probe: vi.fn(async () => 'missing' as const) });
    expect(await recoverFromStaleChunk(deps, assets)).toBe('asset-missing');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('does not reload when any asset of the burst is missing', async () => {
    const probe = vi.fn(async (p: string) => (p.endsWith('.js') ? 'missing' : 'ok') as 'missing' | 'ok');
    const deps = makeDeps({ check: same(), probe });
    expect(await recoverFromStaleChunk(deps, () => ['/assets/a.css', '/assets/b.js'])).toBe('asset-missing');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('retries an unreachable service, then reloads once it answers', async () => {
    const probe = vi.fn<RecoverDeps['probe']>().mockResolvedValueOnce('unreachable').mockResolvedValueOnce('ok');
    const deps = makeDeps({ check: same(), probe });
    expect(await recoverFromStaleChunk(deps, assets)).toBe('reloaded');
    expect(probe).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledWith(STALE_CHUNK_RETRY_DELAYS_MS[0]);
  });

  it('reports asset-unreachable when the service never answers', async () => {
    const deps = makeDeps({ check: same(), probe: vi.fn(async () => 'unreachable' as const) });
    expect(await recoverFromStaleChunk(deps, assets)).toBe('asset-unreachable');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('reloads at most once per window, so a failure that survives a reload is reported', async () => {
    const deps = makeDeps({ check: same(), readSameStamp: () => 1_000_000 - (SAME_BUILD_RELOAD_LOCK_MS - 1) });
    expect(await recoverFromStaleChunk(deps, assets)).toBe('same-build-guard');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('does not reload while index.html or an entry asset is unreachable, even when the failed chunk is served', async () => {
    const deps = makeDeps({ check: same(), entryOk: vi.fn(async () => false) });
    expect(await recoverFromStaleChunk(deps, assets)).toBe('asset-unreachable');
    expect(deps.entryOk).toHaveBeenCalledTimes(STALE_CHUNK_RETRY_DELAYS_MS.length + 1);
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('does not check the entry when the failed asset is missing', async () => {
    const deps = makeDeps({ check: same(), probe: vi.fn(async () => 'missing' as const) });
    await recoverFromStaleChunk(deps, assets);
    expect(deps.entryOk).not.toHaveBeenCalled();
  });

  it('reports instead of reloading again when the chunk and entry are served but the import still fails after a reload', async () => {
    let stamp = 0;
    const deps = makeDeps({
      check: same(),
      readSameStamp: () => stamp,
      writeSameStamp: vi.fn((at: number) => { stamp = at; return true; }),
    });
    expect(await recoverFromStaleChunk(deps, assets)).toBe('reloaded');
    deps.readStamp = () => 0;
    expect(await recoverFromStaleChunk(deps, assets)).toBe('same-build-guard');
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it('aborts the probe request when it times out', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const deps = makeDeps({ check: same(), probe: vi.fn((_p: string, s: AbortSignal) => { signal = s; return new Promise<never>(() => {}); }) });
    const pending = recoverFromStaleChunk(deps, assets);
    await vi.advanceTimersByTimeAsync(STALE_CHUNK_CHECK_TIMEOUT_MS * (STALE_CHUNK_RETRY_DELAYS_MS.length + 1));
    expect(await pending).toBe('asset-unreachable');
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it('keeps reporting same when the message names no asset', async () => {
    const deps = makeDeps({ check: same() });
    expect(await recoverFromStaleChunk(deps)).toBe('same');
    expect(deps.probe).not.toHaveBeenCalled();
  });

  it('does not reload when the same-build stamp cannot be stored', async () => {
    const deps = makeDeps({ check: same(), writeSameStamp: vi.fn(() => false) });
    expect(await recoverFromStaleChunk(deps, assets)).toBe('storage-blocked');
    expect(deps.reload).not.toHaveBeenCalled();
  });
});
