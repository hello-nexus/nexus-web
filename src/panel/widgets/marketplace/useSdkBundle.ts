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

import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { postService, fetchServiceBlob, isRemoteOrigin, isForceLanMode } from '../../../api/service';
import { getMarketplaceListing, subscribeMarketplaceRegistry } from '../../../widgets/marketplaceRegistry';

interface CodeSession { sessionId: string; baseUrl: string; expiresInSeconds?: number; }

const bundleCache = new Map<string, string>();

// The host-shared SDK runtime (react-dom + remote-dom + @hellonexus/* ≈ 188 KB).
// Fetched ONCE per session (relay-aware bytes → one blob URL) and imported by every
// widget worker, so each widget.mjs is only the author's ~5 KB of code.
const RUNTIME_PATH = '/sdk-runtime.mjs';
let runtimePromise: Promise<string | null> | null = null;
// A failed load (service restarting) is retried while a widget shows the failure.
const RETRY_MS = 5000;
const RETRY_MAX_MS = 60_000;

async function resolveRuntime(): Promise<string | null> {
  // The service serves static files without CORS headers, so a desktop page on
  // the website loads the copy its own origin ships, built with its receiver.
  const blob = isRemoteOrigin && isForceLanMode()
    ? await fetch(RUNTIME_PATH).then((r) => (r.ok ? r.blob() : null), () => null)
    : await fetchServiceBlob(RUNTIME_PATH, { mayBeCached: true });
  if (!blob) return null;
  return URL.createObjectURL(new Blob([blob], { type: 'text/javascript' }));
}

export function useSdkRuntime(): { runtimeUrl: string | null; failed: boolean } {
  const [runtimeUrl, setRuntimeUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = RETRY_MS;
    const attempt = () => {
      // Only a success stays cached; a null result is dropped so the next attempt refetches.
      runtimePromise ??= resolveRuntime().catch(() => null).then((u) => {
        if (!u) runtimePromise = null;
        return u;
      });
      void runtimePromise.then((u) => {
        if (!alive) return;
        if (u) { setRuntimeUrl(u); setFailed(false); } else { setFailed(true); timer = setTimeout(attempt, delay); delay = Math.min(delay * 2, RETRY_MAX_MS); }
      });
    };
    attempt();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return { runtimeUrl, failed };
}

// One fetch per key in flight, so instances resolving together share one URL:
// the URL is part of a worker's identity, and a second one would respawn it.
const pendingBundles = new Map<string, Promise<string | null>>();

// One code-session per app version, shared by the widget bundle and any file a
// host component reads from the same bundle (a Canvas renderer module).
// A session is reused for part of the lifetime the service reports, and dropped
// early when the code route refuses it (a service restart forgets sessions).
const CODE_SESSION_REUSE_FRACTION = 0.75;
const codeSessions = new Map<string, { reuseUntil: number; session: Promise<CodeSession | null> }>();

function codeSessionFor(listingId: string, key: string): Promise<CodeSession | null> {
  const cached = codeSessions.get(key);
  if (cached && Date.now() < cached.reuseUntil) return cached.session;
  const minted = Date.now();
  const session = postService<CodeSession>(
    `/apps-api/installed/${encodeURIComponent(listingId)}/code-session`, {},
  ).then((s) => (s?.baseUrl ? s : null), () => null);
  const entry = { reuseUntil: Number.POSITIVE_INFINITY, session };
  codeSessions.set(key, entry);
  void session.then((s) => {
    if (!s) { if (codeSessions.get(key) === entry) codeSessions.delete(key); return; }
    entry.reuseUntil = s.expiresInSeconds && s.expiresInSeconds > 0
      ? minted + s.expiresInSeconds * 1000 * CODE_SESSION_REUSE_FRACTION
      : minted;
  });
  return session;
}

/** Reads one file of a bundle through its code-session; one fresh session is minted if the route refuses the cached one. */
async function fetchViaSession(listingId: string, key: string, relPath: string): Promise<Blob | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await codeSessionFor(listingId, key);
    if (!session) return null;
    const blob = await fetchServiceBlob(`${session.baseUrl}/${relPath}`);
    if (blob) return blob;
    codeSessions.delete(key);
  }
  return null;
}

/** Reads one file of an installed app's bundle through the code route, relay-aware. */
export async function fetchBundleFile(listingId: string, relPath: string, version: string): Promise<Blob | null> {
  return fetchViaSession(listingId, `${listingId}@${version}`, relPath);
}

async function resolveBundle(listingId: string, key: string): Promise<string | null> {
  const blob = await fetchViaSession(listingId, key, 'widget.mjs');
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
  const [retryTick, retry] = useReducer((n: number) => n + 1, 0);
  const retryDelay = useRef(RETRY_MS);

  useEffect(() => {
    if (!listingId || key === null || bundleCache.has(key)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = pendingBundles.get(key);
    if (!pending) {
      pending = resolveBundle(listingId, key).catch(() => null).finally(() => pendingBundles.delete(key));
      pendingBundles.set(key, pending);
    }
    void pending.then((url) => {
      if (!alive) return;
      if (url) { retryDelay.current = RETRY_MS; resolved(); } else {
        setFailedKey(key);
        timer = setTimeout(retry, retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, RETRY_MAX_MS);
      }
    });
    return () => { alive = false; clearTimeout(timer); };
  }, [listingId, key, retryTick]);

  // Read per render, never held in state: a caller switched to another app must
  // not be handed the previous app's bundle while the new one resolves.
  return {
    entryUrl: key === null ? null : bundleCache.get(key) ?? null,
    failed: !listingId || (key !== null && failedKey === key && !bundleCache.has(key)),
  };
}
