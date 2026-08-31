// Panel mount for a sandboxed SDK widget. Sibling to DeclarativeWidget: it spawns
// the worker, wires per-instance local-state persistence + settings/size push, and
// renders the worker's remote tree as real @hellonexus/ui components. A pure
// flex-fill container, like DeclarativeWidget, since the panel cell sizes it.

import { DEV_TOOLS } from '../lib/devTools';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RemoteTree } from './RemoteTree';
import { SdkErrorBoundary } from './SdkErrorBoundary';
import { spawnSandboxedWidget, type SandboxContext, type SandboxHandle } from './host';
import { MediaImportProvider } from './mediaImportContext';

export interface SandboxedWidgetProps {
  /** Blob URL of the host-shared SDK runtime; the worker imports it before the
   *  author bundle so react-dom/remote-dom/the SDK are downloaded once, not per widget. */
  runtimeUrl: string;
  /** Absolute URL to the built worker bundle (served per code-session in prod). */
  entryUrl: string;
  widgetId: string;
  instanceId: string;
  settings?: Record<string, unknown>;
  /** Cert/manifest net.fetch host allowlist (e.g. ["api.open-meteo.com"]). */
  netFetch?: string[];
  /** Cert/manifest sensors.read pattern allowlist (e.g. ["cpu.*"]). */
  sensorsRead?: string[];
  /** Which surface to render: 'cell' (panel tile, default), 'page' (expanded
   *  full view), or 'immersive' (fullscreen overlay). Each is a separate
   *  worker render of the same bundle - the distinct cache key keeps an
   *  immersive mount from adopting (and then disposing) the tile's live
   *  worker. The worker itself only ever sees the published 'cell' | 'page'
   *  contract; 'immersive' collapses to 'cell' in its init context. */
  surface?: 'cell' | 'page' | 'immersive';
  /** Catalog preview - host I/O stubbed (persistLocal no-op, dispatch resolves
   *  { ok: false }); the app branches via the SDK's usePreview(). */
  preview?: boolean;
  /** Host dispatch for gated control/host actions; returns the dispatch envelope. */
  onDispatch?: (action: string, args?: Record<string, unknown>) => Promise<unknown>;
  /** Cert/manifest mediaImport path allowlist (e.g. ["/tryx/media"]). The host
   *  checks this before opening a file picker or uploading on the widget's behalf. */
  mediaImport?: string[];
}

const localKey = (widgetId: string, instanceId: string) => `nexus.sdk.local.${widgetId}.${instanceId}`;

function readLocal(widgetId: string, instanceId: string): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(localKey(widgetId, instanceId)) ?? '{}') as Record<string, unknown>; }
  catch { return {}; }
}

// Keep-alive cache. The panel remounts a widget's whole subtree for transient
// reasons (e.g. opening the edit sheet re-parents the cell into the editor-dock
// portal - a changed return shape, so React unmounts + remounts). Respawning the
// worker + refetching data each time is a visible reload. Instead we keep the
// live worker for a short grace window keyed by instance, so a remount reuses it
// and the RemoteTree re-renders the receiver's existing tree instantly. A widget
// that is genuinely removed disposes after the window elapses.
interface LiveWidget {
  handle: SandboxHandle;
  disposeTimer: ReturnType<typeof setTimeout> | null;
  // A widget can be on screen twice at once - the panel cell keeps rendering
  // behind the fullscreen (immersive) view of the same instance - and both
  // drive this one worker, which holds one size. Newest mount last: it owns the
  // size, and when it leaves the one below re-asserts its own, else the cell
  // stays drawn at fullscreen scale. Disposal waits for the last mount.
  mounts: Array<{ pushSize: () => void }>;
}
const liveWidgets = new Map<string, LiveWidget>();
const KEEP_ALIVE_MS = 2500;

export function SandboxedWidget({ runtimeUrl, entryUrl, widgetId, instanceId, settings, netFetch, sensorsRead, surface, preview, onDispatch, mediaImport }: SandboxedWidgetProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Cache key includes the surface so a widget's cell and page workers (separate
  // renders of the same bundle) never collide; ':preview' keeps a preview worker
  // from ever being reused for a live mount.
  const cacheKey = `${widgetId}:${instanceId}:${surface ?? 'cell'}${preview ? ':preview' : ''}`;
  // Seed from the keep-alive cache synchronously: on a remount (edit-sheet open/
  // close re-parents the cell) the live worker already exists, so the FIRST
  // render shows the tree - no blank frame / flicker.
  const [handle, setHandle] = useState<SandboxHandle | null>(
    () => liveWidgets.get(cacheKey)?.handle ?? null,
  );
  const settingsKey = JSON.stringify(settings ?? {});

  const handleRef = useRef<SandboxHandle | null>(null);
  const pushOwnSize = useCallback(() => {
    const el = wrapRef.current;
    const h = handleRef.current;
    if (!el || !h) return;
    const width = Math.round(el.clientWidth);
    const height = Math.round(el.clientHeight);
    if (width > 0 && height > 0) h.update({ size: { width, height } });
  }, []);
  // This mount's identity inside the cache entry's stack; stable for its life.
  const mountRef = useRef<{ pushSize: () => void } | null>(null);
  if (mountRef.current === null) mountRef.current = { pushSize: () => pushOwnSize() };

  useEffect(() => {
    const key = cacheKey;
    const mount = mountRef.current!;
    let entry = liveWidgets.get(key);

    if (entry) {
      // Reuse across a transient remount; cancel any pending disposal.
      if (entry.disposeTimer) { clearTimeout(entry.disposeTimer); entry.disposeTimer = null; }
      entry.handle.update({ settings: settings ?? {} });
    } else {
      const el = wrapRef.current;
      const size = el
        ? { width: Math.round(el.clientWidth), height: Math.round(el.clientHeight) }
        : { width: 0, height: 0 };

      const context: SandboxContext = {
        instanceId,
        widgetId,
        // 'immersive' is host-side only (own worker + cache key); the worker
        // contract (useSurface) knows 'cell' | 'page', and the immersive
        // worker renders the cell face.
        surface: surface === 'page' ? 'page' : 'cell',
        preview: !!preview,
        devTools: DEV_TOOLS,
        size,
        settings: settings ?? {},
        local: readLocal(widgetId, instanceId),
        netFetch: netFetch ?? [],
        sensorsRead: sensorsRead ?? [],
        api: {
          persistLocal: preview
            ? () => { /* preview: no localStorage writes */ }
            : (next) => {
                try { localStorage.setItem(localKey(widgetId, instanceId), JSON.stringify(next)); }
                catch { /* quota / private mode */ }
              },
          // Preview: standard envelope, onDispatch never called.
          dispatch: preview
            ? () => Promise.resolve({ ok: false })
            : (action, args) => onDispatch?.(action, args) ?? Promise.resolve(null),
        },
      };
      entry = { handle: spawnSandboxedWidget(runtimeUrl, entryUrl, context), disposeTimer: null, mounts: [] };
      liveWidgets.set(key, entry);
    }

    handleRef.current = entry.handle;
    entry.mounts.push(mount);
    setHandle(entry.handle);
    pushOwnSize();

    return () => {
      setHandle(null);
      handleRef.current = null;
      const e = liveWidgets.get(key);
      if (!e) return;
      const at = e.mounts.indexOf(mount);
      if (at >= 0) e.mounts.splice(at, 1);
      const below = e.mounts[e.mounts.length - 1];
      if (below) { below.pushSize(); return; }
      if (!e.disposeTimer) {
        e.disposeTimer = setTimeout(() => {
          e.handle.dispose();
          liveWidgets.delete(key);
        }, KEEP_ALIVE_MS);
      }
    };
    // Identity is the widget instance + surface (+ preview); entryUrl/settings
    // change in place (reused worker is updated, never respawned for a
    // transient blob-url change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetId, instanceId, surface, preview]);

  useEffect(() => {
    handle?.update({ settings: settings ?? {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey, handle]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined' || !handle) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      // Only the newest mount drives the size: a cell reflowing behind an open
      // fullscreen view of the same widget must not shrink it.
      const e = liveWidgets.get(cacheKey);
      if (e && e.mounts.length > 0 && e.mounts[e.mounts.length - 1] !== mountRef.current) return;
      handle.update({ size: { width: Math.round(rect.width), height: Math.round(rect.height) } });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [handle, cacheKey]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', display: 'flex', minWidth: 0, minHeight: 0 }}>
      {handle ? (
        <SdkErrorBoundary widgetId={widgetId} resetKey={handle.receiver}>
          <MediaImportProvider allowed={mediaImport ?? []}>
            <RemoteTree receiver={handle.receiver} />
          </MediaImportProvider>
        </SdkErrorBoundary>
      ) : null}
    </div>
  );
}
