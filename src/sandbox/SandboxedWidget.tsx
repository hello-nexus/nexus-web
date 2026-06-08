// Panel mount for a sandboxed SDK widget. Sibling to DeclarativeWidget: it spawns
// the worker, wires per-instance local-state persistence + settings/size push, and
// renders the worker's remote tree as real @hellonexus/ui components. A pure
// flex-fill container, like DeclarativeWidget, since the panel cell sizes it.

import { useEffect, useRef, useState } from 'react';
import { RemoteTree } from './RemoteTree';
import { spawnSandboxedWidget, type SandboxContext, type SandboxHandle } from './host';

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
  /** Which surface to render: 'cell' (panel tile, default) or 'page' (expanded
   *  full view). The page is a separate worker render of the same bundle. */
  surface?: 'cell' | 'page';
  /** Host dispatch for gated control/host actions; returns the dispatch envelope. */
  onDispatch?: (action: string, args?: Record<string, unknown>) => Promise<unknown>;
}

const localKey = (widgetId: string, instanceId: string) => `nexus.sdk.local.${widgetId}.${instanceId}`;

function readLocal(widgetId: string, instanceId: string): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(localKey(widgetId, instanceId)) ?? '{}') as Record<string, unknown>; }
  catch { return {}; }
}

// Keep-alive cache. The panel remounts a widget's whole subtree for transient
// reasons (e.g. opening the edit sheet re-parents the cell into the editor-dock
// portal — a changed return shape, so React unmounts + remounts). Respawning the
// worker + refetching data each time is a visible reload. Instead we keep the
// live worker for a short grace window keyed by instance, so a remount reuses it
// and the RemoteTree re-renders the receiver's existing tree instantly. A widget
// that is genuinely removed disposes after the window elapses.
interface LiveWidget { handle: SandboxHandle; disposeTimer: ReturnType<typeof setTimeout> | null; }
const liveWidgets = new Map<string, LiveWidget>();
const KEEP_ALIVE_MS = 2500;

export function SandboxedWidget({ runtimeUrl, entryUrl, widgetId, instanceId, settings, netFetch, sensorsRead, surface, onDispatch }: SandboxedWidgetProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Cache key includes the surface so a widget's cell and page workers (separate
  // renders of the same bundle) never collide.
  const cacheKey = `${widgetId}:${instanceId}:${surface ?? 'cell'}`;
  // Seed from the keep-alive cache synchronously: on a remount (edit-sheet open/
  // close re-parents the cell) the live worker already exists, so the FIRST
  // render shows the tree — no blank frame / flicker.
  const [handle, setHandle] = useState<SandboxHandle | null>(
    () => liveWidgets.get(cacheKey)?.handle ?? null,
  );
  const settingsKey = JSON.stringify(settings ?? {});

  useEffect(() => {
    const key = cacheKey;
    let entry = liveWidgets.get(key);

    if (entry) {
      // Reuse across a transient remount; cancel any pending disposal.
      if (entry.disposeTimer) { clearTimeout(entry.disposeTimer); entry.disposeTimer = null; }
      entry.handle.update({ settings: settings ?? {} });
      setHandle(entry.handle);
    } else {
      const el = wrapRef.current;
      const size = el
        ? { width: Math.round(el.clientWidth), height: Math.round(el.clientHeight) }
        : { width: 0, height: 0 };

      const context: SandboxContext = {
        instanceId,
        widgetId,
        surface: surface ?? 'cell',
        size,
        settings: settings ?? {},
        local: readLocal(widgetId, instanceId),
        netFetch: netFetch ?? [],
        sensorsRead: sensorsRead ?? [],
        api: {
          persistLocal: (next) => {
            try { localStorage.setItem(localKey(widgetId, instanceId), JSON.stringify(next)); }
            catch { /* quota / private mode */ }
          },
          dispatch: (action, args) => onDispatch?.(action, args) ?? Promise.resolve(null),
        },
      };
      entry = { handle: spawnSandboxedWidget(runtimeUrl, entryUrl, context), disposeTimer: null };
      liveWidgets.set(key, entry);
      setHandle(entry.handle);
    }

    return () => {
      setHandle(null);
      const e = liveWidgets.get(key);
      if (e && !e.disposeTimer) {
        e.disposeTimer = setTimeout(() => {
          e.handle.dispose();
          liveWidgets.delete(key);
        }, KEEP_ALIVE_MS);
      }
    };
    // Identity is the widget instance + surface; entryUrl/settings change in place
    // (reused worker is updated, never respawned for a transient blob-url change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetId, instanceId, surface]);

  useEffect(() => {
    handle?.update({ settings: settings ?? {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey, handle]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined' || !handle) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) handle.update({ size: { width: Math.round(rect.width), height: Math.round(rect.height) } });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [handle]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', display: 'flex', minWidth: 0, minHeight: 0 }}>
      {handle ? <RemoteTree receiver={handle.receiver} /> : null}
    </div>
  );
}
