// Panel mount for a sandboxed SDK widget. Sibling to DeclarativeWidget: it spawns
// the worker, wires per-instance local-state persistence + settings/size push, and
// renders the worker's remote tree as real @hellonexus/ui components. A pure
// flex-fill container, like DeclarativeWidget, since the panel cell sizes it.

import { DEV_TOOLS } from '../lib/devTools';
import { useTranslation } from '../lib/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RemoteTree } from './RemoteTree';
import { SdkErrorBoundary } from './SdkErrorBoundary';
import { spawnSandboxedWidget, type SandboxContext, type SandboxHandle } from './host';
import { MediaImportProvider } from './mediaImportContext';
import { useImmersiveExit } from '../panel/overlays/immersiveExit';
import { useMultiplex, useTopicCallback } from '../hooks/useMultiplexSocket';
import { getAppData, putAppData, appDataTopic } from './appDataClient';
import { AudioInstanceEngine, isWebAudioSupported } from './audioEngine';
import type { AppDataDoc, WidgetDisplay } from '../../sdk/runtime/context';

// Mirrors the service's key contract (`^[a-z0-9][a-z0-9._-]{0,63}$`) and its
// per-app key cap - checked here too so a bad or excess key never reaches the
// network at all.
const APP_DATA_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const APP_DATA_MAX_KEYS_PER_APP = 16;

/** Forwards one app-data topic's pushes into the worker's store; rendered once
 *  per key the worker has actually read or written this mount. Also re-reads
 *  the doc on a socket reconnect (a push that landed while disconnected is
 *  otherwise lost - the topic resubscribes but the server doesn't replay). */
function AppDataTopicBridge({ appId, dataKey, onFrame }: { appId: string; dataKey: string; onFrame: (doc: AppDataDoc) => void }) {
  const connected = useMultiplex()?.connected ?? false;
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current) {
      void getAppData(appId, dataKey).then(onFrame).catch(() => { /* next reconnect retries */ });
    }
    wasConnected.current = connected;
  }, [connected, appId, dataKey, onFrame]);

  useTopicCallback(appDataTopic(appId, dataKey), true, (raw) => {
    const frame = raw as Partial<AppDataDoc> | null;
    if (frame && typeof frame.revision === 'number' && typeof frame.updatedAt === 'string') {
      onFrame({ revision: frame.revision, updatedAt: frame.updatedAt, data: frame.data });
    }
  });
  return null;
}

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
  /** Opens this widget's own immersive view; absent, the worker's useImmersive().enter is undefined. */
  onEnterImmersive?: () => void;
  /** The worker's useOpaque(): whether the tile paints every pixel of its box. Cell surface only. */
  onOpaqueChange?: (opaque: boolean) => void;
  /** Cert/manifest mediaImport path allowlist (e.g. ["/tryx/media"]). The host
   *  checks this before opening a file picker or uploading on the widget's behalf. */
  mediaImport?: string[];
  /** Manifest `capabilities.appData`. Gates useAppData's host bridge; the
   *  appId bound into every call is always this widget's own listing id. */
  appData?: boolean;
  /** Manifest `capabilities.audio`. Gates useAudio's host bridge; also needs
   *  WebAudio support and is refused in preview and on a streamed render. */
  audio?: boolean;
  /** True when this render is captured by the streamed-panels engine (device
   *  video encoded from an off-screen page, not a real window on this PC) -
   *  see isStreamedPanelSurface. Forces useAudio().available false so a
   *  widget never plays sound through the host machine's own speakers. */
  streamed?: boolean;
  /** This tile's actual shape - 'round' only for the masked Kraken glass.
   *  Default 'rect'. Ignored (forced 'rect') in preview. */
  displayShape?: 'rect' | 'round';
  /** The panel surface's input method (see surfaceInputMode). Default
   *  'pointer'. Ignored (forced 'pointer') in preview. */
  displayInput?: 'touch' | 'pointer' | 'none';
  /** The panel grid cells the tile spans, for the worker's useDisplay(). */
  displayCells?: { cols: number; rows: number };
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
  // The last mount left: its audio parks on the next tick, unless a remount reuses the worker first.
  parkTimer: ReturnType<typeof setTimeout> | null;
  // A widget can be on screen twice at once - the panel cell keeps rendering
  // behind the fullscreen (immersive) view of the same instance - and both
  // drive this one worker, which holds one size. Newest mount last: it owns the
  // size, and when it leaves the one below re-asserts its own, else the cell
  // stays drawn at fullscreen scale. Disposal waits for the last mount.
  mounts: Array<{ pushSize: () => void; exitImmersive: () => void; enterImmersive: () => void; wakeAppData: () => void; setOpaque: (opaque: boolean) => void }>;
  // The worker's last useOpaque() report, for the life of the WORKER: a
  // remount that adopts it never hears the report again, so it reads this.
  opaque: boolean;
  // Keys the worker has read or written, for the life of the WORKER (not the
  // mount): a remount that adopts this cached worker must keep subscribing
  // the same topics, or a push landing during the keep-alive window is lost.
  appDataKeys: Set<string>;
  // This instance's WebAudio sampler; null when audio is unavailable. Lives
  // for the life of the WORKER, disposed alongside it.
  audioEngine: AudioInstanceEngine | null;
  // When a press last reached the worker from any of its mounts; spent by the first enterImmersive after it.
  pressedAt: number;
  // The same press time, never spent: audio solo claims are honoured only shortly after one.
  touchedAt: number;
}
const liveWidgets = new Map<string, LiveWidget>();
const KEEP_ALIVE_MS = 2500;
/** How long after a press the host passed to a widget it may still open its immersive view, so only a tap opens it. */
const ENTER_AFTER_PRESS_MS = 1500;
/** How long after a press a widget may claim the page's solo audio clock, so only the tile being used takes the music. */
const SOLO_AFTER_PRESS_MS = 10_000;

/** Validates and records a key the worker just read or wrote, then wakes the
 *  newest mount so it (re)renders that key's topic bridge. Throws (before any
 *  network call) on a malformed key or once the per-app key cap is reached. */
function noteAppDataKey(entry: LiveWidget, key: string): void {
  if (typeof key !== 'string' || !APP_DATA_KEY_PATTERN.test(key)) {
    throw new Error(`invalid app-data key: ${JSON.stringify(key)}`);
  }
  if (entry.appDataKeys.has(key)) return;
  if (entry.appDataKeys.size >= APP_DATA_MAX_KEYS_PER_APP) {
    throw new Error(`app-data key limit reached (${APP_DATA_MAX_KEYS_PER_APP})`);
  }
  entry.appDataKeys.add(key);
  entry.mounts[entry.mounts.length - 1]?.wakeAppData();
}

export function SandboxedWidget({ runtimeUrl, entryUrl, widgetId, instanceId, settings, netFetch, sensorsRead, surface, preview, onDispatch, mediaImport, appData, audio, streamed, displayShape, displayInput, displayCells, onEnterImmersive, onOpaqueChange }: SandboxedWidgetProps) {
  // The overlay's animated close, for the immersive worker's useImmersive().
  // The worker's api object is created once, so a reused worker resolves it
  // through the cache entry's newest mount, not the mount that spawned it.
  const exitImmersive = useImmersiveExit();
  const exitImmersiveRef = useRef(exitImmersive);
  exitImmersiveRef.current = exitImmersive;
  const enterImmersiveRef = useRef(onEnterImmersive);
  enterImmersiveRef.current = onEnterImmersive;
  const opaqueChangeRef = useRef(onOpaqueChange);
  opaqueChangeRef.current = onOpaqueChange;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Cache key includes the surface so a widget's cell and page workers (separate
  // renders of the same bundle) never collide; ':preview' keeps a preview worker
  // from ever being reused for a live mount. The bundle URL is part of it:
  // useSdkBundle mints one per app version, so a new URL means updated code.
  const cacheKey = `${widgetId}:${instanceId}:${surface ?? 'cell'}${preview ? ':preview' : ''}:${entryUrl}`;
  const notePress = useCallback(() => {
    const e = liveWidgets.get(cacheKey);
    if (e) e.pressedAt = e.touchedAt = performance.now();
  }, [cacheKey]);
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
  // Forces a re-render to pick up the cache entry's appDataKeys (see
  // noteAppDataKey) - only the newest mount is ever woken, so only it renders
  // the topic bridges below.
  const [, bumpAppDataTick] = useState(0);
  // This mount's identity inside the cache entry's stack; stable for its life.
  const mountRef = useRef<LiveWidget["mounts"][number] | null>(null);
  if (mountRef.current === null) {
    mountRef.current = {
      pushSize: () => pushOwnSize(),
      exitImmersive: () => exitImmersiveRef.current?.(),
      enterImmersive: () => enterImmersiveRef.current?.(),
      wakeAppData: () => bumpAppDataTick((t) => t + 1),
      setOpaque: (opaque) => opaqueChangeRef.current?.(opaque),
    };
  }

  const { language } = useTranslation();
  const appDataEnabled = !!appData && !preview;
  const audioEnabled = !!audio && !preview && !streamed && isWebAudioSupported();
  const display: WidgetDisplay = preview
    ? { shape: 'rect', input: 'pointer' }
    : { shape: displayShape ?? 'rect', input: displayInput ?? 'pointer', ...(displayCells ? { cells: displayCells } : {}) };
  const displayKey = `${display.shape}:${display.input}:${display.cells ? `${display.cells.cols}x${display.cells.rows}` : ''}`;

  useEffect(() => {
    const key = cacheKey;
    const mount = mountRef.current!;
    let entry = liveWidgets.get(key);

    if (entry) {
      // Reuse across a transient remount; cancel any pending disposal.
      if (entry.disposeTimer) { clearTimeout(entry.disposeTimer); entry.disposeTimer = null; }
      if (entry.parkTimer) { clearTimeout(entry.parkTimer); entry.parkTimer = null; }
      entry.audioEngine?.unpark();
      entry.handle.update({ settings: settings ?? {} });
    } else {
      const el = wrapRef.current;
      const size = el
        ? { width: Math.round(el.clientWidth), height: Math.round(el.clientHeight) }
        : { width: 0, height: 0 };

      const audioEngine = audioEnabled ? new AudioInstanceEngine() : null;
      const context: SandboxContext = {
        instanceId,
        widgetId,
        // 'immersive' is host-side only (own worker + cache key); the worker
        // contract (useSurface) knows 'cell' | 'page', and the immersive
        // worker renders the cell face.
        surface: surface === 'page' ? 'page' : 'cell',
        immersive: surface === 'immersive',
        display,
        locale: language,
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
          exitImmersive: surface === 'immersive'
            ? () => { const e = liveWidgets.get(key); e?.mounts[e.mounts.length - 1]?.exitImmersive(); }
            : undefined,
          // Only a live tile's worker may open its immersive view, through the newest mount's current gate like exitImmersive.
          enterImmersive: ((surface ?? 'cell') === 'cell' && !preview && onEnterImmersive)
            ? () => {
                const e = liveWidgets.get(key);
                if (!e || performance.now() - e.pressedAt > ENTER_AFTER_PRESS_MS) return;
                e.pressedAt = -Infinity;
                e.mounts[e.mounts.length - 1]?.enterImmersive();
              }
            : undefined,
          setOpaque: (surface ?? 'cell') === 'cell' && !preview
            ? (opaque) => {
                const e = liveWidgets.get(key);
                if (!e) return;
                e.opaque = opaque === true;
                for (const m of e.mounts) m.setOpaque(e.opaque);
              }
            : undefined,
          appDataGet: appDataEnabled
            ? (dataKey) => {
                try { noteAppDataKey(entry!, dataKey); } catch (err) { return Promise.reject(err); }
                return getAppData(widgetId, dataKey);
              }
            : undefined,
          appDataPut: appDataEnabled
            ? (dataKey, baseRevision, data) => {
                try { noteAppDataKey(entry!, dataKey); } catch (err) { return Promise.reject(err); }
                return putAppData(widgetId, dataKey, baseRevision, data);
              }
            : undefined,
          audioLoad: audioEngine ? (id, channels, sampleRate, loop) => audioEngine.load(id, channels, sampleRate, loop) : undefined,
          audioPlay: audioEngine ? (id, opts) => audioEngine.play(id, opts) : undefined,
          audioClock: audioEngine ? (name, lead) => audioEngine.clock(name, lead) : undefined,
          audioSolo: audioEngine
            ? (name) => {
                const e = liveWidgets.get(key);
                if (!e || performance.now() - e.touchedAt > SOLO_AFTER_PRESS_MS) return;
                audioEngine.solo(name);
              }
            : undefined,
          audioStop: audioEngine ? (opts) => audioEngine.stop(opts) : undefined,
          audioReverb: audioEngine ? (id, wet) => audioEngine.reverb(id, wet) : undefined,
          audioVolume: audioEngine ? (level, fade) => audioEngine.volume(level, fade) : undefined,
        },
      };
      entry = { handle: spawnSandboxedWidget(runtimeUrl, entryUrl, context), disposeTimer: null, mounts: [], opaque: false, appDataKeys: new Set(), pressedAt: -Infinity, touchedAt: -Infinity, audioEngine, parkTimer: null };
      liveWidgets.set(key, entry);
    }

    handleRef.current = entry.handle;
    entry.mounts.push(mount);
    if (entry.opaque) mount.setOpaque(true);
    setHandle(entry.handle);
    // On the reuse path `entry.handle` is unchanged, so the setHandle above is
    // a no-op render-wise; force one anyway so isNewestMount (read at render
    // time) picks up this mount just having become the newest.
    mount.wakeAppData();
    pushOwnSize();

    return () => {
      setHandle(null);
      handleRef.current = null;
      const e = liveWidgets.get(key);
      if (!e) return;
      const at = e.mounts.indexOf(mount);
      if (at >= 0) e.mounts.splice(at, 1);
      mount.setOpaque(false);
      const below = e.mounts[e.mounts.length - 1];
      if (below) { below.pushSize(); below.wakeAppData(); return; }
      // The last mount of this worker is gone (e.g. closing the immersive
      // view) - stop any music on the next tick rather than waiting out the
      // keep-alive window, and hand its solo clock back to the tile below.
      // A remount in the same commit (an edit sheet re-parenting the cell)
      // cancels it, so the tile keeps its music and its solo.
      if (e.audioEngine && !e.parkTimer) {
        e.parkTimer = setTimeout(() => { e.parkTimer = null; e.audioEngine?.park(); }, 0);
      }
      if (!e.disposeTimer) {
        e.disposeTimer = setTimeout(() => {
          e.handle.dispose();
          e.audioEngine?.dispose();
          liveWidgets.delete(key);
        }, KEEP_ALIVE_MS);
      }
    };
    // Identity is the widget instance + surface (+ preview) + bundle; settings
    // change in place on the reused worker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetId, instanceId, surface, preview, entryUrl]);

  useEffect(() => {
    handle?.update({ settings: settings ?? {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey, handle]);

  useEffect(() => {
    handle?.update({ display });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayKey, handle]);

  useEffect(() => {
    handle?.update({ locale: language });
  }, [language, handle]);

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

  // The cache entry may already carry keys another (earlier) mount of this
  // same worker noted - e.g. a remount inside the keep-alive window. Only the
  // newest mount renders bridges; a demoted mount is woken (see
  // wakeAppData) once it becomes newest again.
  const liveEntry = liveWidgets.get(cacheKey);
  const isNewestMount = !!liveEntry && liveEntry.mounts[liveEntry.mounts.length - 1] === mountRef.current;

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', display: 'flex', minWidth: 0, minHeight: 0 }}>
      {handle ? (
        <SdkErrorBoundary widgetId={widgetId} resetKey={handle.receiver}>
          <MediaImportProvider allowed={mediaImport ?? []}>
            <RemoteTree receiver={handle.receiver} onGesture={notePress} />
          </MediaImportProvider>
        </SdkErrorBoundary>
      ) : null}
      {appDataEnabled && handle && isNewestMount && liveEntry && [...liveEntry.appDataKeys].map((key) => (
        <AppDataTopicBridge
          key={key}
          appId={widgetId}
          dataKey={key}
          onFrame={(doc) => handle.update({ appData: { key, ...doc } })}
        />
      ))}
    </div>
  );
}
