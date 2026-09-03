import { vi } from 'vitest';

// Waits bounded by REAL time. A fixed number of event-loop turns races the
// crypto.subtle work these tests depend on: it resolves on the threadpool, and
// a loaded CI runner (or a starved worker thread) can take far longer than a
// handful of turns. Captured at module load, before any test installs fake
// timers, so both the bound and the yield stay real under vi.useFakeTimers().
const realSetTimeout = globalThis.setTimeout;
const realNow = Date.now;

export function realSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => realSetTimeout(resolve, ms));
}

/** Real-timer wait: polls `ready()` every real millisecond until it holds or `maxRealMs` pass. */
export async function waitFor(ready: () => boolean, maxRealMs = 10_000): Promise<void> {
  const start = realNow();
  while (!ready() && realNow() - start < maxRealMs) await realSleep(1);
}

/**
 * Fake-timer pump: advances `stepMs` of fake time per round and sleeps one
 * real millisecond between rounds, until `ready()` holds or `maxRealMs` pass.
 * Bounded so a genuine regression still fails instead of hanging.
 */
export async function pumpUntil(ready: () => boolean, stepMs = 0, maxRealMs = 10_000): Promise<void> {
  const start = realNow();
  while (!ready() && realNow() - start < maxRealMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
    await realSleep(1);
  }
}
