// Shared concurrency cap for icon/image-style blob fetches (app shortcut
// icons, deck custom images, process icons, ...). A screenful of rows - or
// several of these sources mounted at once - would otherwise each burst one
// request per item against the browser's per-origin connection pool. The
// panel's /ping health check shares that same pool, so it queues behind the
// backlog and blows its abort timeout, reading "offline" and tearing down
// the editor. One shared pool (not one per call site) is load-bearing here:
// independent per-module caps would each stay under the limit individually
// while their combined in-flight count still saturates the pool exactly the
// way this exists to prevent.

const MEDIA_FETCH_CONCURRENCY = 3;
let permits = MEDIA_FETCH_CONCURRENCY;
const waiters: Array<() => void> = [];

export function withMediaFetchSlot<T>(run: () => Promise<T>): Promise<T> {
  const acquire = permits > 0
    ? (permits--, Promise.resolve())
    : new Promise<void>(resolve => waiters.push(resolve));
  return acquire.then(async () => {
    try {
      return await run();
    } finally {
      const next = waiters.shift();
      if (next) next();
      else permits++;
    }
  });
}
