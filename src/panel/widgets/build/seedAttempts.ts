// A snapshot the Build portal never produced (offline, a portal error, a timeout) is not retried on every launch: the
// failure is kept for a day, per case and setup, and a changed setup is a new attempt.

const KEY = 'nexus.buildSeed.failed';
export const SEED_RETRY_MS = 24 * 60 * 60 * 1000;

type Failures = Record<string, number>;

const read = (): Failures => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Failures) : {};
  } catch {
    return {};
  }
};

/** What one attempt is keyed by: the case and the setup the layout was resolved from. */
export const seedAttemptKey = (caseId: string, layoutKey: string): string => `${caseId}|${layoutKey}`;

/** True while a failure for this attempt is younger than a day. */
export function seedFailedRecently(attempt: string, now: number = Date.now()): boolean {
  const at = read()[attempt];
  return typeof at === 'number' && now - at < SEED_RETRY_MS;
}

/** Remembers a failed attempt, and forgets those older than a day. */
export function recordSeedFailure(attempt: string, now: number = Date.now()): void {
  try {
    const kept = Object.fromEntries(Object.entries(read()).filter(([, at]) => typeof at === 'number' && now - at < SEED_RETRY_MS));
    localStorage.setItem(KEY, JSON.stringify({ ...kept, [attempt]: now }));
  } catch {
    // Storage is unavailable; the failure is remembered for this page only.
  }
}

/** Test seam. */
export function clearSeedFailures(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
