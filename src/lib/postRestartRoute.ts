const KEY = 'nexus_post_restart_lighting';
const MAX_AGE_MS = 5 * 60_000;

/** Marks that a restart from Fix lighting is under way, so the reopened dashboard returns to Lighting. */
export function markLightingRestart(now: number = Date.now()): void {
  try { localStorage.setItem(KEY, String(now)); } catch { /* storage unavailable: the dashboard reopens on its default page */ }
}

/** True once for a recent mark; stale or malformed marks are dropped. */
export function consumeLightingRestart(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return false;
    localStorage.removeItem(KEY);
    const at = Number(raw);
    return Number.isFinite(at) && now - at >= 0 && now - at <= MAX_AGE_MS;
  } catch {
    return false;
  }
}
