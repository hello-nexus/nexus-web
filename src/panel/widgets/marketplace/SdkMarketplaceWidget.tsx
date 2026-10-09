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
import { usePanelDisplayBound } from '../common/PanelDisplayBoundContext';
import { useReportOpaque } from '../common/PanelOpaqueContext';
import { useSdkBundle, useSdkRuntime } from './useSdkBundle';
import { isStreamedPanelSurface, surfaceInputMode, widgetDisplayShape, type PanelSurface, type PanelWidgetSize } from '../../types';
import { sizeToSpan } from '../../engine/grid';
import styles from './MarketplaceWidget.module.scss';
import { usePanelGlassSurface } from '../common/PanelGlassSurfaceContext';

export interface SdkMarketplaceWidgetProps {
  listing: AppInstalledListing;
  size: PanelWidgetSize;
  instanceId: string;
  /** Worker render surface. 'immersive' spawns a SEPARATE worker (own
   *  keep-alive cache key) so closing the fullscreen overlay never disposes
   *  the tile's live worker. Default 'cell'. */
  sandboxSurface?: 'cell' | 'immersive';
  /** The panel this tile is placed on; feeds the SDK's useDisplay(). Absent
   *  on the desktop-embedded "My Computer" preview, which has no device
   *  record - treated as the desktop dashboard (pointer input). */
  surface?: PanelSurface;
  /** Companion to `surface` for a promoted monitor's per-device digitizer. */
  deviceTouch?: boolean;
  /** Opens this widget's fullscreen immersive view. Only meaningful on the
   *  'cell' surface; backs the SDK's useImmersive().enter. */
  onEnterImmersive?: () => void;
}

export function SdkMarketplaceWidget({ listing, instanceId, sandboxSurface, size, surface, deviceTouch, onEnterImmersive }: SdkMarketplaceWidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const displayBound = usePanelDisplayBound();
  const { entryUrl, failed: bundleFailed } = useSdkBundle(listing.id);
  const { runtimeUrl, failed: runtimeFailed } = useSdkRuntime();
  const failed = bundleFailed || runtimeFailed;
  const [opaque, setOpaque] = useState(false);
  useReportOpaque(instanceId, opaque && !failed);

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
  const mediaImport = useMemo(() => listing.capabilities.mediaImport ?? [], [listing]);
  const appData = !!listing.capabilities.appData;
  const audio = !!listing.capabilities.audio;
  const glass = usePanelGlassSurface(surface);
  const streamed = glass != null && isStreamedPanelSurface(glass, displayBound);
  const displayShape = widgetDisplayShape(size);
  const displayInput = surfaceInputMode(surface ?? 'desktop', deviceTouch);
  // The fullscreen view has no grid span.
  const displayCells = useMemo(() => (sandboxSurface === 'immersive' ? undefined : sizeToSpan(size)), [sandboxSurface, size]);

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
      surface={sandboxSurface}
      settings={settings}
      netFetch={netFetch}
      sensorsRead={sensorsRead}
      mediaImport={mediaImport}
      appData={appData}
      audio={audio}
      streamed={streamed}
      displayShape={displayShape}
      displayInput={displayInput}
      displayCells={displayCells}
      preview={preview}
      onDispatch={onDispatch}
      onEnterImmersive={onEnterImmersive}
      onOpaqueChange={setOpaque}
    />
  );
}
