// @hellonexus/sdk hooks. Real React hooks over the worker context store + the
// existing `nexus.*` worker RPC. Authoring feels native; the only difference
// from a built-in widget is that data/host access goes through these hooks
// instead of importing app stores directly.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from './context';

declare global {
  // The boot script installs this; sensor/net access for SDK widgets reuses it.
  var nexus: {
    log(level: string, message: string, data?: unknown): void;
    sensors: {
      read(id: string): Promise<unknown>;
      subscribe(pattern: string, cb: (reading: unknown) => void): Promise<() => void>;
    };
    net: { fetch(url: string, init?: RequestInit): Promise<Response> };
  } | undefined;
}

/** Widget settings (host-pushed, live). */
export function useSettings<T = Record<string, unknown>>(): T {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().settings) as T;
}

/** Current rendered pixel size of the widget tile (host-pushed on resize). */
export function useSize(): { width: number; height: number } {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().size);
}

/** Which surface this render drives: 'cell' (panel tile) or 'page' (expanded
 *  full view). Static for the render. Lets a single component branch its layout;
 *  mount({ cell, page }) is the alternative when the two trees diverge a lot. */
export function useSurface(): 'cell' | 'page' {
  return useStore().surface;
}

/** Catalog preview render: host I/O is stubbed; render co-located sample data. */
export function usePreview(): boolean {
  return useStore().preview;
}

/** This tile's shape and the operator's input method at this panel surface.
 *  Static for the render. A widget uses this to skip drag/hover affordances
 *  on a touch-only or no-input (display-only) surface, or to lay out inside
 *  a round mask. Preview always reports rect/pointer. */
export function useDisplay(): { shape: 'rect' | 'round'; input: 'touch' | 'pointer' | 'none' } {
  return useStore().display;
}

/** True when the host is an internal DEV_TOOLS build. Static for the render.
 *  Use it to relax a ship-time availability gate on an internal machine; never
 *  to unlock something a shipped build must refuse. */
export function useDevTools(): boolean {
  return useStore().devTools;
}

/** Whether this render is the panel's fullscreen immersive view (its own
 *  worker, so `active` is static for the render), and the host's animated way
 *  out of it. `exit` is a no-op anywhere else. */
export function useImmersive(): { active: boolean; exit: () => void } {
  const store = useStore();
  return { active: store.immersive, exit: () => { store.api.exitImmersive?.(); } };
}

/** Per-instance local state bag. Persisted by the host across reloads; the
 *  setter merges, doing a shallow `localUpdate`-style merge. */
export function useLocalState<T extends object>(
  defaults: T,
): [T, (next: Partial<T>) => void] {
  const store = useStore();
  const raw = useSyncExternalStore(store.subscribe, () => store.getSnapshot().local) as Partial<T>;
  const value = { ...defaults, ...raw } as T;
  const set = useCallback(
    (next: Partial<T>) => store.setLocal({ ...store.getSnapshot().local, ...next }),
    [store],
  );
  return [value, set];
}

/** Re-render on an interval (the SDK's ticking primitive). Pass null to stop.
 *  Returns the current epoch ms at render time. */
export function useTick(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (intervalMs == null) return;
    const handle = setInterval(() => setNow(Date.now()), Math.max(16, intervalMs));
    return () => clearInterval(handle);
  }, [intervalMs]);
  return now;
}

/** Read a single sensor value live (read-only; needs the manifest grant). */
export function useSensor(id: string): unknown {
  const [value, setValue] = useState<unknown>(undefined);
  useEffect(() => {
    if (!id || !globalThis.nexus) return;
    let unsub: (() => void) | undefined;
    let alive = true;
    void globalThis.nexus.sensors
      .subscribe(id, (reading) => { if (alive) setValue(reading); })
      .then((u) => { if (alive) unsub = u; else u(); });
    return () => { alive = false; unsub?.(); };
  }, [id]);
  return value;
}

/** Brokered HTTPS fetch through the host proxy (needs the net.fetch grant). */
export function useFetch<T = unknown>(
  url: string | null,
  opts?: { refreshMs?: number },
): { data: T | undefined; error: unknown; loading: boolean } {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({
    data: undefined, error: undefined, loading: !!url,
  });
  const refreshMs = opts?.refreshMs;
  useEffect(() => {
    if (!url || !globalThis.nexus) { setState({ data: undefined, error: undefined, loading: false }); return; }
    let alive = true;
    const run = async () => {
      try {
        const res = await globalThis.nexus!.net.fetch(url);
        const data = (await res.json()) as T;
        if (alive) setState({ data, error: undefined, loading: false });
      } catch (error) {
        if (alive) setState((s) => ({ ...s, error, loading: false }));
      }
    };
    void run();
    const handle = refreshMs ? setInterval(run, Math.max(30000, refreshMs)) : undefined;
    return () => { alive = false; if (handle) clearInterval(handle); };
  }, [url, refreshMs]);
  return state;
}

/** Imperative brokered HTTPS request - for multi-step flows (e.g. geolocate then
 *  fetch forecast). Routes through the host's SSRF-guarded proxy; needs the grant. */
export async function request(url: string, init?: RequestInit): Promise<Response> {
  if (!globalThis.nexus) throw new Error('[sdk] net.fetch unavailable');
  return globalThis.nexus.net.fetch(url, init);
}

/** Emit a gated control/host action (cooling/lighting/system writes). Returns the
 *  dispatch result so callers can await it; fire-and-forget is fine too. */
export function useDispatch(): (action: string, args?: Record<string, unknown>) => Promise<unknown> {
  const store = useStore();
  return useCallback((action, args) => store.api.dispatch(action, args), [store]);
}

/** Host-action data source: poll a dispatch action on a refresh schedule and
 *  surface its `result`. Mirrors a `host` action poll - the way
 *  first-party widgets read host-internal state (e.g. screentime.today, the
 *  displays list) that isn't a sensor or a public HTTPS endpoint. The action
 *  must be in the manifest's capabilities.dispatch allowlist. */
export function useHostAction<T = unknown>(
  action: string,
  opts?: { args?: Record<string, unknown>; refreshMs?: number },
): { data: T | undefined; loading: boolean } {
  const store = useStore();
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const argsKey = JSON.stringify(opts?.args ?? {});
  const refreshMs = Math.max(2000, opts?.refreshMs ?? 5000);
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const res = (await store.api.dispatch(action, opts?.args)) as { ok?: boolean; result?: T } | null;
        if (alive && res && res.ok !== false) { setData(res.result); setLoading(false); }
        else if (alive) setLoading(false);
      } catch { if (alive) setLoading(false); }
    };
    void run();
    const handle = setInterval(run, refreshMs);
    return () => { alive = false; clearInterval(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, argsKey, refreshMs]);
  return { data, loading };
}

/** A stable ref to the latest value (helper for event handlers). */
export function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

// A stale base is adopted from the 409 body and fn is re-applied this many
// times before update() gives up; a live app-data doc rarely races more than
// once or twice across instances.
const APP_DATA_MAX_ATTEMPTS = 5;

export type AppDataCasResult<T> =
  | { ok: true; revision: number }
  | { ok: false; revision: number; data: T };

/** Generic per-app JSON document, shared by every running instance of this
 *  app on the install (see the nexus.app/1 `appData` capability). `value` is
 *  `initial` until the first read arrives (`ready` false); a push from
 *  another instance replaces `value`/`revision` live. `put` is the primitive:
 *  exactly one compare-and-swap attempt, its result applied to `value`/
 *  `revision` immediately whether it lands or hits a stale-base conflict.
 *  `update(fn)` is the convenience layer: applies `fn` to the latest known
 *  value and retries through `put` on a conflict, a few times, adopting the
 *  server's current document as the next base each time. Preview mode never
 *  touches the host: state lives only in this render. */
export function useAppData<T>(
  key: string,
  initial: T,
): {
  value: T;
  ready: boolean;
  revision: number;
  update: (fn: (current: T) => T) => Promise<boolean>;
  put: (baseRevision: number, data: T) => Promise<AppDataCasResult<T>>;
} {
  const store = useStore();
  const initialRef = useLatest(initial);
  const doc = useSyncExternalStore(store.subscribe, () => store.getSnapshot().appData[key]);
  const bridged = !!(store.api.appDataGet && store.api.appDataPut);

  useEffect(() => {
    if (!bridged) return;
    let alive = true;
    store.api.appDataGet!(key)
      .then((fresh) => { if (alive) store.applyAppData(key, fresh); })
      .catch(() => { /* transient fetch failure: stays not-ready, retried on next mount */ });
    return () => { alive = false; };
  }, [store, bridged, key]);

  const value = doc && doc.data !== null ? (doc.data as T) : initialRef.current;
  const ready = bridged ? doc !== undefined : true;
  const revision = doc?.revision ?? 0;

  const readCurrent = useCallback((): { revision: number; value: T } => {
    const current = store.getSnapshot().appData[key];
    return {
      revision: current?.revision ?? 0,
      value: current && current.data !== null ? (current.data as T) : initialRef.current,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key]);

  const put = useCallback(async (baseRevision: number, data: T): Promise<AppDataCasResult<T>> => {
    if (!bridged) {
      const current = readCurrent();
      if (baseRevision !== current.revision) return { ok: false, revision: current.revision, data: current.value };
      const nextRevision = current.revision + 1;
      store.applyAppData(key, { revision: nextRevision, updatedAt: new Date().toISOString(), data });
      return { ok: true, revision: nextRevision };
    }
    let result;
    try {
      result = await store.api.appDataPut!(key, baseRevision, data);
    } catch {
      // Transient failure (offline/unreachable), not a real conflict - surface
      // it at the last-known revision so a caller never mistakes it for an
      // accepted write.
      const current = readCurrent();
      return { ok: false, revision: current.revision, data: current.value };
    }
    if (result.ok) {
      store.applyAppData(key, { revision: result.revision, updatedAt: result.updatedAt, data });
      return { ok: true, revision: result.revision };
    }
    store.applyAppData(key, { revision: result.revision, updatedAt: result.updatedAt, data: result.data });
    return { ok: false, revision: result.revision, data: result.data as T };
  }, [store, bridged, key, readCurrent]);

  const update = useCallback(async (fn: (current: T) => T): Promise<boolean> => {
    let base = readCurrent();
    for (let attempt = 0; attempt < APP_DATA_MAX_ATTEMPTS; attempt++) {
      const result = await put(base.revision, fn(base.value));
      if (result.ok) return true;
      // put() already applied the server's current document to the store;
      // retry fn against that adopted base.
      base = { revision: result.revision, value: result.data };
    }
    return false;
  }, [put, readCurrent]);

  return { value, ready, revision, update, put };
}
