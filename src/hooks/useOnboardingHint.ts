import { useCallback, useEffect, useState } from 'react';
import { dismissOnboardingHint, fetchOnboardingStatus, type OnboardingStatusResponse } from '../api/onboarding';

// A dismissal the service has not confirmed yet. The service stays the source
// of truth; this list only keeps retrying so a failed POST (service restarting,
// timeout, refusal) cannot bring a closed hint back on a later launch.
const PENDING_KEY = 'nexus.onboarding.pendingHints';
// Ids the service refused for good (a bad id, a full list). Never retried, and
// kept hidden locally so the hint still never comes back.
const REFUSED_KEY = 'nexus.onboarding.refusedHints';

// Hints closed during this session, so a remount before the service answers
// never shows one again.
const closedThisSession = new Set<string>();
const retrying = new Set<string>();

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, ids: string[]): void {
  try {
    if (ids.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* storage unavailable: the session set still holds the hint closed */
  }
}

const readPending = () => readList(PENDING_KEY);
const readRefused = () => readList(REFUSED_KEY);
const addTo = (key: string, id: string) => { const cur = readList(key); if (!cur.includes(id)) writeList(key, [...cur, id]); };
const removePending = (id: string) => writeList(PENDING_KEY, readPending().filter(x => x !== id));

/** True only when the service stored the hint: its answer lists it. */
function confirmed(id: string, r: OnboardingStatusResponse | null | undefined): boolean {
  return !!r && Array.isArray(r.dismissedHints) && r.dismissedHints.includes(id);
}

const REFUSED_STATUSES = [400, 409];

async function send(id: string): Promise<void> {
  if (retrying.has(id)) return;
  retrying.add(id);
  try {
    const { status, body } = await dismissOnboardingHint(id);
    if (status === 200 && confirmed(id, body)) {
      removePending(id);
    } else if (REFUSED_STATUSES.includes(status)) {
      addTo(REFUSED_KEY, id);
      removePending(id);
    }
  } catch {
    /* stays pending */
  } finally {
    retrying.delete(id);
  }
}

export interface OnboardingHint {
  /**
   * null until the service has answered, so a hint never flashes in and out.
   * true also covers a service that predates hints: it cannot remember a
   * dismissal, so the hint never shows.
   */
  dismissed: boolean | null;
  /** Hides the hint at once and tells the service, retrying on later launches until it confirms. */
  dismiss: () => void;
}

/**
 * State of one one-time onboarding hint, kept on the service (GET /onboarding
 * dismissedHints, POST /onboarding/hints/dismiss). The standard way to gate a
 * Coachmark: render it only while `dismissed === false`, and call `dismiss`
 * when the user acts on the hint or closes it. While `enabled` is false it
 * asks the service nothing and `dismissed` stays null.
 */
export function useOnboardingHint(hintId: string, enabled = true): OnboardingHint {
  const [dismissed, setDismissed] = useState<boolean | null>(() => (closedThisSession.has(hintId) ? true : null));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchOnboardingStatus().catch(() => null).then(r => {
      if (!r) return;
      // Every answer retries whatever the service has not confirmed yet.
      if (Array.isArray(r.dismissedHints)) {
        const refused = readRefused();
        for (const id of readPending()) {
          if (r.dismissedHints.includes(id)) removePending(id);
          else if (!refused.includes(id)) void send(id);
        }
      }
      if (cancelled) return;
      const unsupported = !Array.isArray(r.dismissedHints);
      setDismissed(unsupported || closedThisSession.has(hintId) || confirmed(hintId, r) || readPending().includes(hintId) || readRefused().includes(hintId));
    });
    return () => { cancelled = true; };
  }, [hintId, enabled]);

  const dismiss = useCallback(() => {
    closedThisSession.add(hintId);
    setDismissed(true);
    addTo(PENDING_KEY, hintId);
    void send(hintId);
  }, [hintId]);

  return { dismissed, dismiss };
}

/** Test hook: forgets what this session closed and what is queued. */
export function resetOnboardingHintSession(): void {
  closedThisSession.clear();
  retrying.clear();
  writeList(PENDING_KEY, []);
  writeList(REFUSED_KEY, []);
}
