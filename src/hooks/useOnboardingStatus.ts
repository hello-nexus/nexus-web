import { useEffect, useState } from 'react';
import { fetchOnboardingStatus } from '../api/onboarding';

export type OnboardingStatus = 'unknown' | 'pending' | 'completed';

export interface OnboardingGates {
  /** Bumped on every successful read, so a caller can tell a fresh answer from
   *  the one it already acted on (see the reset latches in Dashboard). */
  generation: number;
  /** When the read that produced this answer was ISSUED, so a caller can tell
   *  an answer that predates its own state change from one that follows it. */
  readAt: number;
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
 * Fetches GET /onboarding on mount, and again whenever `reloadKey` changes -
 * a factory reset puts all three flags back to pending under an open
 * dashboard, and a mount-only read would keep showing the completed state
 * until the window was reloaded. All three gates stay 'unknown' (caller
 * must not render the dashboard OR any onboarding screen on that state -
 * only the app background) until the fetch resolves or the retry bound is
 * exhausted, at which point all three fall back to 'completed' so the app is
 * never stuck behind a blank background. lightingCompleted and
 * featuresCompleted are absent on older services; the absence resolves to
 * 'completed' for the same reason.
 */
export function useOnboardingStatus(reloadKey?: unknown): OnboardingGates {
  const [gates, setGates] = useState<OnboardingGates>({ status: 'unknown', lightingStatus: 'unknown', featuresStatus: 'unknown', generation: 0, readAt: 0 });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const attempt = async (n: number) => {
      const issuedAt = Date.now();
      const data = await fetchOnboardingStatus();
      if (cancelled) return;
      if (data) {
        setGates(prev => ({
          status: data.completed ? 'completed' : 'pending',
          lightingStatus: data.lightingCompleted === false ? 'pending' : 'completed',
          featuresStatus: data.featuresCompleted === false ? 'pending' : 'completed',
          generation: prev.generation + 1,
          readAt: issuedAt,
        }));
        return;
      }
      if (n >= MAX_ATTEMPTS) {
        setGates(prev => ({ status: 'completed', lightingStatus: 'completed', featuresStatus: 'completed', generation: prev.generation + 1, readAt: issuedAt }));
        return;
      }
      timer = setTimeout(() => attempt(n + 1), RETRY_DELAY_MS);
    };
    attempt(1);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reloadKey]);

  return gates;
}
