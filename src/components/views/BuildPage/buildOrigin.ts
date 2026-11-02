import { DEV_TOOLS } from '../../../lib/devTools';

export const PRODUCTION_BUILD_ORIGIN = 'https://build.hellonexus.com';

/** Where dev-tools builds read another portal's origin, to frame a branch served from a lab machine. */
export const BUILD_ORIGIN_OVERRIDE_KEY = 'nexus.dev.buildOrigin';

/** The portal the Build page frames: always the site in a release build; in a dev-tools build the origin stored under BUILD_ORIGIN_OVERRIDE_KEY when it is an http(s) one. */
export function resolveBuildOrigin(): string {
  if (!DEV_TOOLS) return PRODUCTION_BUILD_ORIGIN;
  try {
    const raw = localStorage.getItem(BUILD_ORIGIN_OVERRIDE_KEY);
    if (raw) {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    }
  } catch {
    // Storage or the value is unusable; the site stays.
  }
  return PRODUCTION_BUILD_ORIGIN;
}
