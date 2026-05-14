// Module-level cache for the canonical install-time defaults table.
// Bootstrap fires `preload()` at top of main.tsx; the fetch resolves in
// parallel with React tree mount, so by the time hooks query
// `getInstallDefaults()` the cache is populated.
//
// The cache is the only place the SPA reads `install-defaults.json`; any
// FE module that needs an install-time default reads through here instead
// of hardcoding its own copy.

import { fetchInstallDefaults, type InstallDefaultsDocument } from './installDefaults';

let _cache: InstallDefaultsDocument | null = null;
let _inflight: Promise<InstallDefaultsDocument | null> | null = null;

export function preloadInstallDefaults(): Promise<InstallDefaultsDocument | null> {
  if (_cache) return Promise.resolve(_cache);
  if (_inflight) return _inflight;
  _inflight = fetchInstallDefaults()
    .then(d => { _cache = d; return d; })
    .catch(err => { console.warn('[install-defaults] fetch failed:', err); return null; });
  return _inflight;
}

export function getInstallDefaults(): InstallDefaultsDocument | null {
  return _cache;
}
