import { useEffect, useRef, useState } from 'react';
import { fetchOnboardingStatus } from '../api/onboarding';

export type OnboardingStatus = 'unknown' | 'pending' | 'completed';

/**
 * Fetches GET /onboarding once per online session. Stays 'unknown' (caller
 * must not render anything on that state) until the fetch resolves, so a
 * completed install never flashes the welcome screen while the request is
 * in flight.
 */
export function useOnboardingStatus(online: boolean): OnboardingStatus {
  const [status, setStatus] = useState<OnboardingStatus>('unknown');
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!online) {
      fetchedRef.current = false;
      return;
    }
    if (fetchedRef.current) return;
    let cancelled = false;
    fetchOnboardingStatus().then(data => {
      if (cancelled || !data) return;
      fetchedRef.current = true;
      setStatus(data.completed ? 'completed' : 'pending');
    });
    return () => { cancelled = true; };
  }, [online]);

  return status;
}
