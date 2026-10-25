import { fetchService } from './service';

// Single place for the route; the service answers { families, loaded }.
const SYSTEM_FONTS_PATH = '/system/fonts';

export interface SystemFontsResult {
  families: string[];
  // True once the service has enumerated fonts in this process lifetime.
  loaded: boolean;
}

// Installed font families on the host PC. `peek` never makes the service
// enumerate: it reports whether a past call already did. An older service
// ignores `peek` and has no `loaded` flag, so non-empty families count as loaded.
// Empty and not loaded on any failure.
export async function fetchSystemFonts(opts: { peek?: boolean; signal?: AbortSignal } = {}): Promise<SystemFontsResult> {
  try {
    const path = opts.peek ? `${SYSTEM_FONTS_PATH}?peek=true` : SYSTEM_FONTS_PATH;
    const res = await fetchService<{ families?: unknown; loaded?: unknown }>(path, opts.signal);
    if (!res || !Array.isArray(res.families)) return { families: [], loaded: false };
    const families = res.families.filter((f): f is string => typeof f === 'string' && f.trim() !== '');
    const loaded = typeof res.loaded === 'boolean' ? res.loaded : families.length > 0;
    return { families: loaded ? families : [], loaded };
  } catch {
    return { families: [], loaded: false };
  }
}
