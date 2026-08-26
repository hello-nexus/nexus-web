import { useEffect, useState } from 'react';
import { fetchOnboardingStatus } from '../api/onboarding';

export type OnboardingStatus = 'unknown' | 'pending' | 'completed';

export interface OnboardingGates {
  /** First-run welcome screen state. */
  status: OnboardingStatus;
  /** Lighting device-selection screen state, shown after the welcome screen. */
  lightingStatus: OnboardingStatus;
  /** Feature-pillars screen state, shown after the welcome screen and before the import gate. */
  featuresStatus: OnboardingStatus;
}

// GET /onboarding is a token-authed localhost call - getToken() pairs itself
// if needed, so this doesn't wait on the multiplex socket's online state.
// Retries on a null (unreachable/transient) response instead of the failure
// object; bounded so a caller gating render on 'unknown' can never hang.
const RETRY_DELAY_MS = 400;
const MAX_ATTEMPTS = 5;

/**
 * Fetches GET /onboarding on mount. All three gates stay 'unknown' (caller
 * must not render the dashboard OR any onboarding screen on that state -
 * only the app background) until the fetch resolves or the retry bound is
 * exhausted, at which point all three fall back to 'completed' so the app is
 * never stuck behind a blank background. lightingCompleted and
 * featuresCompleted are absent on older services; the absence resolves to
 * 'completed' for the same reason.
 */
export function useOnboardingStatus(): OnboardingGates {
  const [gates, setGates] = useState<OnboardingGates>({ status: 'unknown', lightingStatus: 'unknown', featuresStatus: 'unknown' });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const attempt = async (n: number) => {
      const data = await fetchOnboardingStatus();
      if (cancelled) return;
      if (data) {
        setGates({
          status: data.completed ? 'completed' : 'pending',
          lightingStatus: data.lightingCompleted === false ? 'pending' : 'completed',
          featuresStatus: data.featuresCompleted === false ? 'pending' : 'completed',
        });
        return;
      }
      if (n >= MAX_ATTEMPTS) {
        setGates({ status: 'completed', lightingStatus: 'completed', featuresStatus: 'completed' });
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

  return gates;
}
