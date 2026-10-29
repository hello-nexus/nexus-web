export interface RestartWaitOptions {
  intervalMs: number;
  /** Past this with the service never seen down, the restart is taken as done. */
  graceMs: number;
  timeoutMs: number;
}

/** Resolves once the service has gone down and answered again, or when the grace or timeout window ends. */
export async function waitForServiceRestart(
  ping: () => Promise<unknown>,
  options: RestartWaitOptions,
  sleep: (ms: number) => Promise<void>,
  cancelled: () => boolean = () => false,
): Promise<void> {
  let elapsed = 0;
  let sawDown = false;
  while (elapsed < options.timeoutMs && !cancelled()) {
    await sleep(options.intervalMs);
    elapsed += options.intervalMs;
    const alive = (await ping()) !== null;
    if (!alive) sawDown = true;
    else if (sawDown) return;
    else if (elapsed >= options.graceMs) return;
  }
}
