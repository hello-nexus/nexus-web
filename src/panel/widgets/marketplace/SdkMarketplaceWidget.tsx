// Panel entrypoint for an SDK (sandboxed remote-component) marketplace widget -
// the cell surface. Rendered by MarketplaceWidget for every marketplace widget.
//
// Remote-panel safe: the worker can't live-import the widget bundle over the
// relay (the browser ESM loader can't be tunneled), so we fetch widget.mjs as
// BYTES through the relay-aware service client and hand the worker a same-origin
// blob: URL. The brokered nexus.net.fetch likewise routes through the proxy
// (relay-aware). Everything else (worker, MessagePort UI channel, remote-dom)
// runs locally in the panel's browser.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { postService } from '../../../api/service';
import { WidgetSettingsBridge } from '../../../widgets/settingsBridge';
import type { AppInstalledListing } from '../../../widgets/types';
import { SandboxedWidget } from '../../../sandbox/SandboxedWidget';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { useSdkBundle, useSdkRuntime } from './useSdkBundle';
import styles from './MarketplaceWidget.module.scss';

export interface SdkMarketplaceWidgetProps {
  listing: AppInstalledListing;
  size: string;
  instanceId: string;
}

export function SdkMarketplaceWidget({ listing, instanceId }: SdkMarketplaceWidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const { entryUrl, failed: bundleFailed } = useSdkBundle(listing.id);
  const { runtimeUrl, failed: runtimeFailed } = useSdkRuntime();
  const failed = bundleFailed || runtimeFailed;

  // Per-instance settings via the shared settings bridge. Preview skips the
  // bridge entirely - get() fire-and-forgets a network load on first call.
  const settingsBridge = useMemo(() => new WidgetSettingsBridge(instanceId), [instanceId]);
  const [settings, setSettings] = useState<Record<string, unknown>>(() => (preview ? {} : settingsBridge.get()));
  useEffect(() => {
    if (preview) return;
    const unsub = settingsBridge.onChange((v) => setSettings({ ...v }));
    void settingsBridge.load();
    return unsub;
  }, [settingsBridge, preview]);

  const netFetch = useMemo(() => listing.capabilities['net.fetch'] ?? [], [listing]);
  const sensorsRead = useMemo(() => listing.capabilities['sensors.read'] ?? [], [listing]);

  // Gated host action: POST /apps-api/dispatch (relay-aware). Returns the
  // { ok, result } envelope so the worker's useDispatch / useHostAction work.
  const onDispatch = useCallback(
    (action: string, args?: Record<string, unknown>) =>
      postService<unknown>('/apps-api/dispatch', { appId: listing.id, action, args: args ?? {} }),
    [listing.id],
  );

  if (failed) return <div className={styles.empty}>{t('marketplace.failedToLoad', { name: listing.name })}</div>;
  if (!entryUrl || !runtimeUrl) return <div className={styles.empty}>{t('marketplace.loading', { name: listing.name })}</div>;

  return (
    <SandboxedWidget
      runtimeUrl={runtimeUrl}
      entryUrl={entryUrl}
      widgetId={listing.id}
      instanceId={instanceId}
      settings={settings}
      netFetch={netFetch}
      sensorsRead={sensorsRead}
      preview={preview}
      onDispatch={onDispatch}
    />
  );
}
