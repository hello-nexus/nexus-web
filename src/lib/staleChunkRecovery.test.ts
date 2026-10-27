import { afterEach, describe, expect, it, vi } from 'vitest';

const watcher = vi.hoisted(() => ({
  reload: vi.fn(),
  passedReload: null as null | (() => void),
  checkOnce: vi.fn(),
}));
vi.mock('./buildReloadWatcher', () => ({
  loadedEntry: () => '/assets/index-abc.js',
  liveDeps: () => ({ loaded: '/assets/index-abc.js', reload: watcher.reload }),
  checkOnce: (deps: { reload: () => void }) => {
    watcher.passedReload = deps.reload;
    return watcher.checkOnce();
  },
}));

import {
  isStaleChunkMessage,
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
    now: 1_000_000,
    check: vi.fn(async () => 'reload' as const),
    readStamp: () => stamp,
    writeStamp: vi.fn(() => true),
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

  it.each(['noop', 'same', 'locked', 'unverified'] as const)('does not reload when the watcher check says %s', async (result) => {
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

  it.each(['same', 'locked'] as const)('does not retry a definitive %s result', async (result) => {
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
    vi.useRealTimers();
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
