// @hellonexus/sdk hooks. Real React hooks over the worker context store + the
// existing `nexus.*` worker RPC. Authoring feels native; the only difference
// from a built-in widget is that data/host access goes through these hooks
// instead of importing app stores directly.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getActiveStore, useStore, type AudioPlay, type WidgetDisplay } from './context';

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
 *  Live: a promoted monitor's touch digitizer can be detected after this
 *  worker spawns, so the host may push a later change. A widget uses this to
 *  skip drag/hover affordances on a touch-only or no-input (display-only)
 *  surface, or to lay out inside a round mask. Preview always reports
 *  rect/pointer. */
export function useDisplay(): WidgetDisplay {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().display);
}

/** Tells the host this tile paints every pixel of its box with no
 *  transparency, so a single-widget panel it fills stops drawing the
 *  background hidden under it. Pass true only once the whole tile is covered;
 *  false, or unmounting, hands the background back. */
export function useOpaque(opaque: boolean): void {
  const store = useStore();
  useEffect(() => {
    if (!opaque) return;
    store.api.setOpaque?.(true);
    return () => { store.api.setOpaque?.(false); };
  }, [store, opaque]);
}

/** True when the host is an internal DEV_TOOLS build. Static for the render.
 *  Use it to relax a ship-time availability gate on an internal machine; never
 *  to unlock something a shipped build must refuse. */
export function useDevTools(): boolean {
  return useStore().devTools;
}

/** Nexus's UI language as a BCP 47 tag ('en', 'de', 'pt-BR', 'zh-CN', ...), updated when the user switches it. */
export function useLocale(): string {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().locale);
}

/** Whether this render is the panel's fullscreen immersive view (its own
 *  worker, so `active` is static for the render), and the host's animated way
 *  out of it. `exit` is a no-op anywhere else. `enter` opens this widget's own
 *  immersive view from its tile; it is `undefined` when the host cannot open
 *  one for this render (not on a panel, already immersive, the app manifest
 *  lacks `immersive: true`, or a preview) - feature-detect with `enter !==
 *  undefined` before offering an "expand" affordance. */
export function useImmersive(): { active: boolean; exit: () => void; enter: (() => void) | undefined } {
  const store = useStore();
  return { active: store.immersive, exit: () => { store.api.exitImmersive?.(); }, enter: store.api.enterImmersive };
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
const APP_DATA_MAX_CONFLICT_RETRIES = 5;

// Backoff shared by the initial read's retry and update()'s retry of a
// REJECTED put (429/5xx/offline) - both are "the network/service is
// unhappy", not a same-instant conflict, so both slow down instead of
// hammering. Capped rather than growing forever: the widget may sit on
// screen for hours.
const APP_DATA_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// 400/403/404 mean the request itself is wrong (bad key, no capability grant,
// app or route not found) - retrying it unchanged only repeats the same
// rejection. 429/5xx and a status-less/0 (offline, transport failure) are
// transient and worth another attempt.
function isPermanentAppDataError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return status === 400 || status === 403 || status === 404;
}

export type AppDataCasResult<T> =
  | { ok: true; revision: number }
  | { ok: false; revision: number; data: T };

/** Generic per-app JSON document of the ACTIVE profile, shared by every
 *  running instance of this app (see the nexus.app/1 `appData` capability);
 *  switching profile remounts the app against that profile's document. `value` is
 *  `initial` until the first read arrives (`ready` false); a push from
 *  another instance replaces `value`/`revision` live. A failed initial read
 *  retries with backoff on its own, except a permanent error (400/403/404),
 *  which leaves the widget at `ready: false` rather than spin forever on a
 *  request that can't succeed.
 *
 *  `put` is the primitive: exactly one compare-and-swap attempt. It resolves
 *  `{ ok: false, revision, data }` ONLY for a real 409 conflict (the current
 *  document is applied to `value`/`revision` either way); any other failure
 *  (403/413/422/429/5xx/offline) REJECTS with an `Error` carrying `status` -
 *  callers with their own retry/backoff (or an optimistic local store) must
 *  be able to tell "someone else wrote first" apart from "the write never
 *  reached the service".
 *
 *  `update(fn)` is the convenience layer: applies `fn` to the latest known
 *  value and writes through `put`. A conflict retries immediately (bounded,
 *  adopting the server's document as the next base each time); a REJECTED
 *  put backs off before retrying the same base (bounded separately) rather
 *  than immediately repeating a failure. Resolves `false` once either bound
 *  is exhausted.
 *
 *  Preview mode, and a manifest without `capabilities.appData`, never touch
 *  the host: state lives only in this render, `ready` is `true` immediately,
 *  and `put`'s single-attempt CAS still applies (against the in-memory doc). */
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
  const doc = useSyncExternalStore(store.subscribe, () => store.getSnapshot().appData[key]);
  const bridged = !!(store.api.appDataGet && store.api.appDataPut);

  // Freezes `initial`'s identity per key while no doc exists: a caller that
  // passes a fresh literal every render must not see `value`'s reference
  // change every render with nothing to show for it.
  const frozenInitialRef = useRef<{ key: string; value: T }>({ key, value: initial });
  if (frozenInitialRef.current.key !== key) frozenInitialRef.current = { key, value: initial };
  const initialForKey = frozenInitialRef.current.value;

  useEffect(() => {
    if (!bridged) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const tryFetch = () => {
      store.api.appDataGet!(key)
        .then((fresh) => { if (alive) store.applyAppData(key, fresh); })
        .catch((err) => {
          if (!alive || isPermanentAppDataError(err)) return;
          const ms = APP_DATA_RETRY_DELAYS_MS[Math.min(attempt, APP_DATA_RETRY_DELAYS_MS.length - 1)];
          attempt += 1;
          timer = setTimeout(tryFetch, ms);
        });
    };
    tryFetch();
    return () => { alive = false; clearTimeout(timer); };
  }, [store, bridged, key]);

  const value = doc && doc.data != null ? (doc.data as T) : initialForKey;
  const ready = bridged ? doc !== undefined : true;
  const revision = doc?.revision ?? 0;

  const readCurrent = useCallback((): { revision: number; value: T } => {
    const current = store.getSnapshot().appData[key];
    return {
      revision: current?.revision ?? 0,
      value: current && current.data != null ? (current.data as T) : frozenInitialRef.current.value,
    };
  }, [store, key]);

  const put = useCallback(async (baseRevision: number, data: T): Promise<AppDataCasResult<T>> => {
    if (!bridged) {
      const current = readCurrent();
      if (baseRevision !== current.revision) return { ok: false, revision: current.revision, data: current.value };
      const nextRevision = current.revision + 1;
      store.applyAppData(key, { revision: nextRevision, updatedAt: new Date().toISOString(), data });
      return { ok: true, revision: nextRevision };
    }
    // A rejection (anything but 200/409) propagates as-is: only a real 409
    // resolves here, never a synthesized conflict.
    const result = await store.api.appDataPut!(key, baseRevision, data);
    if (result.ok) {
      store.applyAppData(key, { revision: result.revision, updatedAt: result.updatedAt, data });
      return { ok: true, revision: result.revision };
    }
    store.applyAppData(key, { revision: result.revision, updatedAt: result.updatedAt, data: result.data });
    return { ok: false, revision: result.revision, data: result.data as T };
  }, [store, bridged, key, readCurrent]);

  const update = useCallback(async (fn: (current: T) => T): Promise<boolean> => {
    let base = readCurrent();
    let conflictAttempts = 0;
    let putFailureAttempts = 0;
    for (;;) {
      let result: AppDataCasResult<T>;
      try {
        result = await put(base.revision, fn(base.value));
      } catch {
        putFailureAttempts += 1;
        if (putFailureAttempts > APP_DATA_RETRY_DELAYS_MS.length) return false;
        await delay(APP_DATA_RETRY_DELAYS_MS[putFailureAttempts - 1]);
        base = readCurrent(); // a push may have landed while backing off
        continue;
      }
      if (result.ok) return true;
      conflictAttempts += 1;
      if (conflictAttempts >= APP_DATA_MAX_CONFLICT_RETRIES) return false;
      // put() already applied the server's current document to the store;
      // retry fn against that adopted base, immediately (no backoff).
      base = { revision: result.revision, value: result.data };
    }
  }, [put, readCurrent]);

  return { value, ready, revision, update, put };
}

export interface AppAudio {
  /** False where this host cannot or must not play sound; every other method is then a no-op. */
  readonly available: boolean;
  /** Registers PCM (one Float32Array per channel, -1..1) under `id`, replacing any earlier one. The optional loop points are in seconds. */
  load(id: string, channels: Float32Array[], sampleRate: number, loop?: { start: number; end: number }): void;
  play(id: string, opts?: AudioPlay): void;
  /** Starts, or restarts, a named clock `lead` seconds ahead of the host's audio time (a short default lead). Later `at` values on that clock count from its start. */
  clock(name: string, lead?: number): void;
  /** Makes the named clock, once started, the page's one solo clock: another instance's solo clock fades out and stays silent until that instance calls solo() again or this one goes away. Honoured only shortly after the user pressed this widget. For background music, so only one plays at a time. */
  solo(name: string): void;
  /** Stops voices with a fade: all of this instance's, or only those with the tag, or only those on the clock. */
  stop(opts?: { tag?: string; clock?: string; fade?: number }): void;
  /** Uses a loaded sound as the impulse response of this instance's reverb bus (null turns the bus off); `wet` is the bus's return level. */
  reverb(id: string | null, wet?: number): void;
  /** This instance's master level, ramped over `fade` seconds. */
  volume(level: number, fade?: number): void;
}

const AUDIO_NOOP: AppAudio = {
  available: false,
  load: () => {},
  play: () => {},
  clock: () => {},
  solo: () => {},
  stop: () => {},
  reverb: () => {},
  volume: () => {},
};

/** Generic PCM sampler for a Tier 2 app: synthesize instrument/sfx samples as
 *  Float32Array PCM in the worker, load them once, then schedule playback
 *  through the host's WebAudio document (workers have no AudioContext). See
 *  the nexus.app/1 `audio` capability for when `available` is false - the
 *  widget never has to special-case that itself, since every method is a
 *  no-op in that case. The returned object is stable for the life of the mount. */
export function useAudio(): AppAudio {
  const store = useStore();
  const api = store.api;
  const bridged = !!(api.audioLoad && api.audioPlay && api.audioClock && api.audioSolo && api.audioStop && api.audioReverb && api.audioVolume);
  return useMemo<AppAudio>(() => {
    if (!bridged) return AUDIO_NOOP;
    return {
      available: true,
      load: (id, channels, sampleRate, loop) => api.audioLoad!(id, channels, sampleRate, loop),
      play: (id, opts) => api.audioPlay!(id, opts),
      clock: (name, lead) => api.audioClock!(name, lead),
      solo: (name) => api.audioSolo!(name),
      stop: (opts) => api.audioStop!(opts),
      reverb: (id, wet) => api.audioReverb!(id, wet),
      volume: (level, fade) => api.audioVolume!(level, fade),
    };
  }, [api, bridged]);
}

/** Records an anonymous app usage event. Fire-and-forget: it never throws and
 *  never blocks. Needs `capabilities.telemetry: true` in the manifest; a no-op
 *  on a preview render and on a host build that does not record app telemetry.
 *  A host predating track() has no such export, so the import is `undefined`
 *  there and calling it throws: guard with `typeof track === 'function'`. The
 *  event and property rules are in sdk/docs/CAPABILITIES.md. */
export function track(event: string, properties?: Record<string, string | number | boolean>): void {
  const store = getActiveStore();
  if (!store || store.preview || !store.api.track) return;
  try {
    void Promise.resolve(store.api.track(event, properties)).catch(() => { /* host reports a rejection */ });
  } catch { /* fire-and-forget */ }
}
