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

/** Per-instance local state bag. Persisted by the host across reloads; the
 *  setter merges, mirroring the declarative `localUpdate`. */
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

/** Imperative brokered HTTPS request — for multi-step flows (e.g. geolocate then
 *  fetch forecast). Routes through the host's SSRF-guarded proxy; needs the grant. */
export async function request(url: string, init?: RequestInit): Promise<Response> {
  if (!globalThis.nexus) throw new Error('[sdk] net.fetch unavailable');
  return globalThis.nexus.net.fetch(url, init);
}

/** Emit a gated control/host action (cooling/lighting/system writes). */
export function useDispatch(): (action: string, args?: Record<string, unknown>) => void {
  const store = useStore();
  return useCallback((action, args) => { void store.api.dispatch(action, args); }, [store]);
}

/** A stable ref to the latest value (helper for event handlers). */
export function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
