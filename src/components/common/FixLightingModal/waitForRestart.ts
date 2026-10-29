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
): Promise<boolean> {
  let elapsed = 0;
  let sawDown = false;
  while (elapsed < options.timeoutMs && !cancelled()) {
    await sleep(options.intervalMs);
    elapsed += options.intervalMs;
    const res = await ping();
    if (res === null) sawDown = true;
    else if (sawDown && res.initialized) return true;
  }
  return false;
}
