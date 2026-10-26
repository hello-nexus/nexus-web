// A per-viewer convenience kept in the browser, same mechanism as the LED map
// product picker's recents (lighting/page/recentProducts.ts).
const STORAGE_KEY = 'panel.theme.recentSystemFonts';
export const RECENT_SYSTEM_FONTS_MAX = 3;

/** System families last picked, most recent first. Empty when storage is
 *  unavailable or unreadable. */
export function loadRecentSystemFonts(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, RECENT_SYSTEM_FONTS_MAX);
  } catch {
    return [];
  }
}

/** Moves `family` to the front, dropping an older copy and anything past the cap. */
export function pushRecentSystemFont(family: string): string[] {
  const next = [family, ...loadRecentSystemFonts().filter(f => f !== family)].slice(0, RECENT_SYSTEM_FONTS_MAX);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the pick still lands, it is only not remembered.
  }
  return next;
}
