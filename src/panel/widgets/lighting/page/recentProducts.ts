import { type BuiltInMappingSummary } from '../../../../api/lighting';

// A per-viewer convenience, so it lives in the browser and never touches the
// service: someone chaining six identical fans picks the second to sixth from
// here instead of searching each time.
const STORAGE_KEY = 'lighting.ledMap.recentProducts';
export const RECENT_PRODUCTS_MAX = 3;

/** Products last assigned from the chain picker, most recent first. Empty
 *  when storage is unavailable or unreadable (a private window, cleared site
 *  data), which the picker treats as nothing to show. */
export function loadRecentProducts(): BuiltInMappingSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSummary).slice(0, RECENT_PRODUCTS_MAX);
  } catch {
    return [];
  }
}

/** Moves `item` to the front, dropping an older copy of its key and anything past the cap. */
export function pushRecentProduct(item: BuiltInMappingSummary): void {
  const next = [item, ...loadRecentProducts().filter(r => r.key !== item.key)].slice(0, RECENT_PRODUCTS_MAX);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the pick still lands, it is only not remembered.
  }
}

function isSummary(x: unknown): x is BuiltInMappingSummary {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.key === 'string' && typeof r.name === 'string' && typeof r.ledCount === 'number';
}
