import { useCallback, useEffect, useState } from 'react';
import { fetchFanControlStatus, type FanControlStatusResponse } from '../api/fancontrol';

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
    void fetchFanControlStatus().then(res => {
      if (cancelled) return;
      setPayload(res);
      setStatus(res?.pending ? 'pending' : 'settled');
    });
    return () => { cancelled = true; };
  }, [nonce]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);
  return { status, payload, refresh };
}
