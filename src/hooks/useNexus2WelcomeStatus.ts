import { useCallback, useEffect, useState } from 'react';
import { fetchNexus2Status, type Nexus2StatusResponse } from '../api/migration';

export type Nexus2WelcomeStatus = 'unknown' | 'pending' | 'completed';

// Same bounded-retry shape as useOnboardingStatus: retries a null (unreachable
// / transient) response, never the payload itself, so a caller gating render
// on 'unknown' can never hang.
const RETRY_DELAY_MS = 400;
const MAX_ATTEMPTS = 5;

export interface Nexus2WelcomeState {
  status: Nexus2WelcomeStatus;
  payload: Nexus2StatusResponse | null;
  /** Re-reads detection, for a surface that opens the import on demand. */
  refresh: () => void;
}

/**
 * Fetches GET /migration/nexus2 on mount. Stays 'unknown' until the fetch
 * resolves or the retry bound is exhausted, at which point it falls back to
 * 'completed' so the dashboard can never hang behind it. 'pending' only when
 * the payload's `pending` flag is true - `detected`/`deviceEligible` alone
 * are not enough (the service also gates on prior dismissal).
 */
export function useNexus2WelcomeStatus(): Nexus2WelcomeState {
  const [status, setStatus] = useState<Nexus2WelcomeStatus>('unknown');
  const [payload, setPayload] = useState<Nexus2StatusResponse | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const attempt = async (n: number) => {
      // Settles on a rejection too, not just on a null: a caller that gates a
      // gate or a spinner on this must never be left waiting forever.
      const data = await fetchNexus2Status().catch(() => null);
      if (cancelled) return;
      if (data) {
        setPayload(data);
        setStatus(data.pending ? 'pending' : 'completed');
        return;
      }
      if (n >= MAX_ATTEMPTS) {
        setStatus('completed');
        return;
      }
      timer = setTimeout(() => void attempt(n + 1), RETRY_DELAY_MS);
    };
    void attempt(1);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);
  return { status, payload, refresh };
}
