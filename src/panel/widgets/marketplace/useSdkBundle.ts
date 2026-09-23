// Resolve an installed SDK bundle's widget.mjs to a same-origin blob: URL the
// worker can import. Shared by the cell widget (SdkMarketplaceWidget) and the
// page surface (SdkMarketplacePage) so there is one fetch path, not two.
//
// Remote-panel safe: the worker can't live-import the bundle over the relay (the
// browser ESM loader can't be tunneled), so we mint a code-session and fetch the
// bytes through the relay-aware service client, then hand the worker a blob: URL.
// One resolved URL per app version, cached for the session (identical across
// instances + remounts), so a transient remount reuses it instead of re-minting,
// and an app updated on disk resolves to a new URL.

import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import { postService, fetchServiceBlob } from '../../../api/service';
import { getMarketplaceListing, subscribeMarketplaceRegistry } from '../../../widgets/marketplaceRegistry';

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

// One fetch per key in flight, so instances resolving together share one URL:
// the URL is part of a worker's identity, and a second one would respawn it.
const pendingBundles = new Map<string, Promise<string | null>>();

async function resolveBundle(listingId: string, key: string): Promise<string | null> {
  const session = await postService<CodeSession>(
    `/apps-api/installed/${encodeURIComponent(listingId)}/code-session`, {},
  );
  if (!session?.baseUrl) return null;
  const blob = await fetchServiceBlob(`${session.baseUrl}/widget.mjs`);
  if (!blob) return null;
  const url = URL.createObjectURL(new Blob([blob], { type: 'text/javascript' }));
  bundleCache.set(key, url);
  return url;
}

export function useSdkBundle(listingId: string): { entryUrl: string | null; failed: boolean } {
  // Null until the registry lists the app, so nothing is fetched under a version that is about to change.
  const version = useSyncExternalStore(subscribeMarketplaceRegistry, () => getMarketplaceListing(listingId)?.version ?? null);
  const key = version === null ? null : `${listingId}@${version}`;
  const [, resolved] = useReducer((n: number) => n + 1, 0);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!listingId || key === null || bundleCache.has(key)) return;
    let alive = true;
    let pending = pendingBundles.get(key);
    if (!pending) {
      pending = resolveBundle(listingId, key).catch(() => null).finally(() => pendingBundles.delete(key));
      pendingBundles.set(key, pending);
    }
    void pending.then((url) => {
      if (!alive) return;
      if (url) resolved(); else setFailedKey(key);
    });
    return () => { alive = false; };
  }, [listingId, key]);

  // Read per render, never held in state: a caller switched to another app must
  // not be handed the previous app's bundle while the new one resolves.
  return {
    entryUrl: key === null ? null : bundleCache.get(key) ?? null,
    failed: !listingId || (key !== null && failedKey === key && !bundleCache.has(key)),
  };
}
