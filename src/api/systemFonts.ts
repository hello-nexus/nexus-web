import { fetchService } from './service';

// Single place for the route; the service answers { families: string[] }.
const SYSTEM_FONTS_PATH = '/system/fonts';

// Installed font families on the host PC, empty on any failure.
export async function fetchSystemFonts(signal?: AbortSignal): Promise<string[]> {
  try {
    const res = await fetchService<{ families?: unknown }>(SYSTEM_FONTS_PATH, signal);
    if (!res || !Array.isArray(res.families)) return [];
    return res.families.filter((f): f is string => typeof f === 'string' && f.trim() !== '');
  } catch {
    return [];
  }
}
