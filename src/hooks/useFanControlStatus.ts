import { useCallback, useEffect, useState } from 'react';
import { fetchFanControlStatus, type FanControlStatusResponse } from '../api/fancontrol';

// Same bounded retry as useOnboardingStatus / useNexus2WelcomeStatus: the
// dashboard can mount before the service answers, and settling on the first
// null would drop the gate for the whole session.
const RETRY_DELAY_MS = 400;
const MAX_ATTEMPTS = 5;


export type FanControlGateStatus = 'unknown' | 'pending' | 'settled';

export interface FanControlGate {
  status: FanControlGateStatus;
  payload: FanControlStatusResponse | null;
  /** Re-reads detection, for a surface that opens the import on demand. */
  refresh: () => void;
}

/**
 * Reads GET /migration/fancontrol once on mount. Stays 'unknown' until the
 * fetch resolves so the onboarding sequence never flashes the dashboard before
 * deciding whether this gate opens; an unreachable service settles rather than
 * hanging the sequence.
 */
export function useFanControlStatus(): FanControlGate {
  const [status, setStatus] = useState<FanControlGateStatus>('unknown');
  const [payload, setPayload] = useState<FanControlStatusResponse | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const attempt = async (n: number) => {
      // Settles on a rejection too, not just on a null: the dashboard waits on
      // this gate, so a request that throws (a non-JSON body, a dropped
      // connection) must not leave it 'unknown' forever.
      const data = await fetchFanControlStatus().catch(() => null);
      if (cancelled) return;
      if (data) {
        setPayload(data);
        setStatus(data.pending ? 'pending' : 'settled');
        return;
      }
      if (n >= MAX_ATTEMPTS) {
        setStatus('settled');
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
