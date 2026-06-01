import { useEffect, useRef } from 'react';
import { pingService } from '../../api/service';

/**
 * Poll the service every `intervalMs` ms; close the kiosk window after
 * `failThreshold` consecutive failures. Handles force-kill, crash, or any
 * shutdown that bypasses the service's ApplicationStopping hook.
 *
 * The optional `onPing` callback fires on every successful response so
 * consumers (e.g. the tray's "Connected to <PC>" header) can pick up
 * server-side changes (host display name override) without an extra
 * polling loop.
 */
interface KioskWatchdogOptions {
  enabled?: boolean;
  intervalMs?: number;
  failThreshold?: number;
  onPing?: (response: NonNullable<Awaited<ReturnType<typeof pingService>>>) => void;
}

export function useKioskWatchdog(
  enabledOrOptions: boolean | KioskWatchdogOptions = true,
  intervalMs = 3000,
  failThreshold = 3,
) {
  const opts: Required<Omit<KioskWatchdogOptions, 'onPing'>> & Pick<KioskWatchdogOptions, 'onPing'> =
    typeof enabledOrOptions === 'object'
      ? {
          enabled: enabledOrOptions.enabled ?? true,
          intervalMs: enabledOrOptions.intervalMs ?? 3000,
          failThreshold: enabledOrOptions.failThreshold ?? 3,
          onPing: enabledOrOptions.onPing,
        }
      : { enabled: enabledOrOptions, intervalMs, failThreshold };

  const failCountRef = useRef(0);
  const onPingRef = useRef(opts.onPing);
  useEffect(() => { onPingRef.current = opts.onPing; }, [opts.onPing]);

  useEffect(() => {
    if (!opts.enabled) return;
    const watchdog = setInterval(async () => {
      const response = await pingService();
      if (response) {
        failCountRef.current = 0;
        onPingRef.current?.(response);
      } else {
        failCountRef.current++;
        if (failCountRef.current >= opts.failThreshold) {
          window.close();
        }
      }
    }, opts.intervalMs);
    return () => clearInterval(watchdog);
  }, [opts.enabled, opts.intervalMs, opts.failThreshold]);
}
