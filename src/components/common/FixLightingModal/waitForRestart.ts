export interface RestartWaitOptions {
  intervalMs: number;
  timeoutMs: number;
}

/**
 * Resolves true once the service has been seen down and then answers initialized again; false on timeout
 * or cancel. A restart too fast to be seen down reports false, since the ping carries no start time to tell
 * the old process from the new one.
 */
export async function waitForServiceRestart(
  ping: () => Promise<{ initialized: boolean } | null>,
  options: RestartWaitOptions,
  sleep: (ms: number) => Promise<void>,
  cancelled: () => boolean = () => false,
  now: () => number = Date.now,
): Promise<boolean> {
  const deadline = now() + options.timeoutMs;
  let sawDown = false;
  while (now() < deadline && !cancelled()) {
    await sleep(options.intervalMs);
    const res = await ping();
    if (res === null) sawDown = true;
    else if (sawDown && res.initialized) return true;
  }
  return false;
}
