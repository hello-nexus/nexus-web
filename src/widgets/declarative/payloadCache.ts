// localStorage-backed cache of the most recent worker payload per widget.
// Lets a dashboard reload hydrate the last-known data immediately instead
// of flashing the empty state while the worker re-fetches.
//
// Cache shape is intentionally per-widget (not per-instance) — two copies
// of the same widget on a dashboard share the same upstream data, and the
// cache is the worker's last publish, not anything instance-specific.

const KEY_PREFIX = 'qos.widget.payload.v1.';
const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KiB per widget cap

export function loadCachedWorkerPayload(widgetId: string): Record<string, unknown> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + widgetId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    // Corrupt entry — drop it so we don't keep retrying on every mount.
    try { localStorage.removeItem(KEY_PREFIX + widgetId); } catch { /* ignore */ }
    return null;
  }
}

export function saveCachedWorkerPayload(widgetId: string, payload: Record<string, unknown>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_PAYLOAD_BYTES) {
      // Don't blow out the localStorage quota with one chatty widget.
      // The cache is a nice-to-have; if a single payload exceeds the
      // cap, fall back to not caching that one.
      return;
    }
    localStorage.setItem(KEY_PREFIX + widgetId, serialized);
  } catch {
    // QuotaExceededError or similar — swallow. The cache is best-effort.
  }
}

export function clearCachedWorkerPayload(widgetId: string): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(KEY_PREFIX + widgetId); } catch { /* ignore */ }
}
