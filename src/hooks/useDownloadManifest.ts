import { useEffect, useState } from 'react';
import { fetchDownloadManifest, type DownloadManifest } from '../lib/downloads';

/** The current release's version and per-OS installer sizes; null until loaded or on failure. */
export function useDownloadManifest(): DownloadManifest | null {
  const [manifest, setManifest] = useState<DownloadManifest | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchDownloadManifest(controller.signal).then(m => { if (m) setManifest(m); });
    return () => controller.abort();
  }, []);
  return manifest;
}
