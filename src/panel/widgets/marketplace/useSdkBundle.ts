// Resolve an installed SDK bundle's widget.mjs to a same-origin blob: URL the
// worker can import. Shared by the cell widget (SdkMarketplaceWidget) and the
// page surface (SdkMarketplacePage) so there is one fetch path, not two.
//
// Remote-panel safe: the worker can't live-import the bundle over the relay (the
// browser ESM loader can't be tunneled), so we mint a code-session and fetch the
// bytes through the relay-aware service client, then hand the worker a blob: URL.
// One resolved URL per widget type, cached for the session (identical across
// instances + remounts), so a transient remount reuses it instead of re-minting.

import { useEffect, useState } from 'react';
import { postService, fetchServiceBlob } from '../../../api/service';

interface CodeSession { sessionId: string; baseUrl: string; }

const bundleCache = new Map<string, string>();

// The host-shared SDK runtime (react-dom + remote-dom + @hellonexus/* ≈ 188 KB).
// Fetched ONCE per session (relay-aware bytes → one blob URL) and imported by every
// widget worker, so each widget.mjs is only the author's ~5 KB of code.
const RUNTIME_PATH = '/sdk-runtime.mjs';
let runtimePromise: Promise<string | null> | null = null;

async function resolveRuntime(): Promise<string | null> {
  const blob = await fetchServiceBlob(RUNTIME_PATH);
  if (!blob) return null;
  return URL.createObjectURL(new Blob([blob], { type: 'text/javascript' }));
}

export function useSdkRuntime(): { runtimeUrl: string | null; failed: boolean } {
  const [runtimeUrl, setRuntimeUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    runtimePromise ??= resolveRuntime();
    void runtimePromise.then((u) => {
      if (!alive) return;
      if (u) setRuntimeUrl(u); else setFailed(true);
    });
    return () => { alive = false; };
  }, []);
  return { runtimeUrl, failed };
}

export function useSdkBundle(listingId: string): { entryUrl: string | null; failed: boolean } {
  const [entryUrl, setEntryUrl] = useState<string | null>(() => bundleCache.get(listingId) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!listingId) { setFailed(true); return; }
    if (bundleCache.has(listingId)) { setEntryUrl(bundleCache.get(listingId)!); return; }
    let alive = true;
    setFailed(false);
    void (async () => {
      const session = await postService<CodeSession>(
        `/apps-api/installed/${encodeURIComponent(listingId)}/code-session`, {},
      );
      if (!alive) return;
      if (!session?.baseUrl) { setFailed(true); return; }
      const blob = await fetchServiceBlob(`${session.baseUrl}/widget.mjs`);
      if (!alive) return;
      if (!blob) { setFailed(true); return; }
      const url = URL.createObjectURL(new Blob([blob], { type: 'text/javascript' }));
      bundleCache.set(listingId, url);
      setEntryUrl(url);
    })();
    return () => { alive = false; };
  }, [listingId]);

  return { entryUrl, failed };
}
