// Panel entrypoint for an SDK (sandboxed remote-component) marketplace widget.
// Sibling to DeclarativeWidget; chosen by MarketplaceWidget when the listing's
// runtime === "sdk".
//
// Remote-panel safe: the worker can't live-import the widget bundle over the
// relay (the browser ESM loader can't be tunneled), so we fetch widget.mjs as
// BYTES through the relay-aware service client and hand the worker a same-origin
// blob: URL. The brokered nexus.net.fetch likewise routes through the proxy
// (relay-aware). Everything else (worker, MessagePort UI channel, remote-dom)
// runs locally in the panel's browser.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { postService, fetchServiceBlob } from '../../../api/service';
import { WidgetSettingsBridge } from '../../../widgets/settingsBridge';
import type { WidgetInstalledListing } from '../../../widgets/types';
import { SandboxedWidget } from '../../../sandbox/SandboxedWidget';
import styles from './MarketplaceWidget.module.scss';

interface CodeSession { sessionId: string; baseUrl: string; }

// One resolved blob: bundle URL per widget type, cached for the session. The
// bundle is identical across instances and remounts, so a transient remount
// (e.g. the edit-sheet re-parent) reuses it instead of re-minting a code-session
// and re-fetching ~200 KB — paired with the worker keep-alive, edit is seamless.
const bundleCache = new Map<string, string>();

export interface SdkMarketplaceWidgetProps {
  listing: WidgetInstalledListing;
  size: string;
  instanceId: string;
}

export function SdkMarketplaceWidget({ listing, instanceId }: SdkMarketplaceWidgetProps) {
  const [entryUrl, setEntryUrl] = useState<string | null>(() => bundleCache.get(listing.id) ?? null);
  const [failed, setFailed] = useState(false);

  // Per-instance settings, same bridge the declarative path uses.
  const settingsBridge = useMemo(() => new WidgetSettingsBridge(instanceId), [instanceId]);
  const [settings, setSettings] = useState<Record<string, unknown>>(() => settingsBridge.get());
  useEffect(() => {
    const unsub = settingsBridge.onChange((v) => setSettings({ ...v }));
    void settingsBridge.load();
    return unsub;
  }, [settingsBridge]);

  const netFetch = useMemo(() => listing.capabilities['net.fetch'] ?? [], [listing]);
  const sensorsRead = useMemo(() => listing.capabilities['sensors.read'] ?? [], [listing]);

  // Gated host action: POST /widgets-api/dispatch (relay-aware). Returns the
  // { ok, result } envelope so the worker's useDispatch / useHostAction work.
  const onDispatch = useCallback(
    (action: string, args?: Record<string, unknown>) =>
      postService<unknown>('/widgets-api/dispatch', { widgetId: listing.id, action, args: args ?? {} }),
    [listing.id],
  );

  // Mint a code session, fetch widget.mjs bytes (relay-aware), expose as a blob.
  // Cached per widget type; not revoked (kept for the session) so remounts reuse it.
  useEffect(() => {
    if (bundleCache.has(listing.id)) { setEntryUrl(bundleCache.get(listing.id)!); return; }
    let alive = true;
    setFailed(false);
    void (async () => {
      const session = await postService<CodeSession>(
        `/widgets-api/installed/${encodeURIComponent(listing.id)}/code-session`, {},
      );
      if (!alive) return;
      if (!session?.baseUrl) { setFailed(true); return; }
      const blob = await fetchServiceBlob(`${session.baseUrl}/widget.mjs`);
      if (!alive) return;
      if (!blob) { setFailed(true); return; }
      const url = URL.createObjectURL(new Blob([blob], { type: 'text/javascript' }));
      bundleCache.set(listing.id, url);
      setEntryUrl(url);
    })();
    return () => { alive = false; };
  }, [listing.id]);

  if (failed) return <div className={styles.empty}>Failed to load {listing.name}</div>;
  if (!entryUrl) return <div className={styles.empty}>Loading {listing.name}…</div>;

  return (
    <SandboxedWidget
      entryUrl={entryUrl}
      widgetId={listing.id}
      instanceId={instanceId}
      settings={settings}
      netFetch={netFetch}
      sensorsRead={sensorsRead}
      onDispatch={onDispatch}
    />
  );
}
