import { useEffect, useState } from 'react';
import { fetchOnboardingStatus } from '../api/onboarding';

export type OnboardingStatus = 'unknown' | 'pending' | 'completed';

// GET /onboarding is a token-authed localhost call - getToken() pairs itself
// if needed, so this doesn't wait on the multiplex socket's online state.
// Retries on a null (unreachable/transient) response instead of the failure
// object; bounded so a caller gating render on 'unknown' can never hang.
const RETRY_DELAY_MS = 400;
const MAX_ATTEMPTS = 5;

/**
 * Fetches GET /onboarding on mount. Stays 'unknown' (caller must not render
 * the dashboard OR the welcome screen on that state - only the app
 * background) until the fetch resolves or the retry bound is exhausted, at
 * which point it falls back to 'completed' so the app is never stuck behind
 * a blank background.
 */
export function useOnboardingStatus(): OnboardingStatus {
  const [status, setStatus] = useState<OnboardingStatus>('unknown');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const attempt = async (n: number) => {
      const data = await fetchOnboardingStatus();
      if (cancelled) return;
      if (data) {
        setStatus(data.completed ? 'completed' : 'pending');
        return;
      }
      if (n >= MAX_ATTEMPTS) {
        setStatus('completed');
        return;
      }
      timer = setTimeout(() => attempt(n + 1), RETRY_DELAY_MS);
    };
    attempt(1);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return status;
}
