// Tier 1 data source resolver. Walks a manifest's `data` block and returns
// a live React-friendly value bag the renderer can bind against. Sources:
//
//  - sensor: pulls from monitoringStore using widget-namespace ids.
//  - fetch + extract: proxied through `/widgets-api/proxy` on schedule,
//                     JSONPath-extracted into typed values.
//  - worker: passthrough - the Tier 2 worker host publishes data via
//            postMessage and merges it into the context by binding name.
//
// The resolver returns an object whose top-level keys are the manifest's
// `data` keys. Each value is the materialised reading (e.g. a sensor's
// numeric value + formatted string) or null when unavailable.

import { useEffect, useMemo, useState } from 'react';
import * as monitoringStore from '../../lib/monitoringStore';
import type { MonitoringFrame } from '../../hooks/useMonitoringFrame';
import { resolveHttp } from '../../api/service';
import { getToken, handleUnauthorized } from '../../api/auth';
import type { WidgetManifestDataSource } from '../types';
import { jsonPath } from './jsonPath';
import { evaluateBinding, type BindingContext } from './bindings';

export interface ResolvedSensorReading {
  id: string;
  name: string;
  type: string;
  units: string;
  value: number;
  formatted: string;
  parentId: string;
  parentName: string;
  timestamp: number;
}

export type ResolvedDataValue =
  | ResolvedSensorReading
  | Record<string, unknown>
  | number
  | string
  | boolean
  | null;

/** Shared monitoring-frame walker matching the qos-service id normalisation
 *  scheme: `<family>.<host-id-with-dots>.<sensor-id-with-dots>`. */
function normaliseSensorId(family: string, raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/^[/.]+/, '')
    .replace(/[/\\:\s]+/g, '.')
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/\.+/g, '.');
  if (cleaned.length === 0) return family;
  if (cleaned.startsWith(family + '.') || cleaned === family) return cleaned;
  return `${family}.${cleaned}`;
}

function* iterateSensors(frame: MonitoringFrame | null): Generator<ResolvedSensorReading> {
  if (!frame) return;
  const now = Date.now();
  const pushComponent = function* (family: string, c: { id?: string; name?: string; sensors?: Array<{ id: string; name?: string; type?: string; units?: string; value?: number; formatted?: string; parent?: { id?: string; name?: string } }> } | null | undefined): Generator<ResolvedSensorReading> {
    if (!c) return;
    const parentId = normaliseSensorId(family, c.id ?? family);
    for (const s of c.sensors ?? []) {
      const id = normaliseSensorId(family, s.id);
      yield {
        id,
        name: s.name ?? '',
        type: s.type ?? '',
        units: s.units ?? '',
        value: typeof s.value === 'number' ? s.value : 0,
        formatted: s.formatted ?? String(s.value ?? ''),
        parentId,
        parentName: c.name ?? '',
        timestamp: now,
      };
    }
  };
  yield* pushComponent('cpu', frame.cpu);
  if (frame.gpu) for (const g of frame.gpu) yield* pushComponent('gpu', g);
  yield* pushComponent('memory', frame.memory);
  yield* pushComponent('motherboard', frame.motherboard);
  if (frame.storage) for (const drive of Object.values(frame.storage)) {
    yield* pushComponent('storage', drive);
  }
}

function pickSensor(frame: MonitoringFrame | null, idPattern: string): ResolvedSensorReading | null {
  // `idPattern` may be an exact id (`cpu.amdcpu.0.temperature.2`), a glob
  // (`cpu.*.temperature*`), or a friendly alias (`cpu.package.temperature`).
  // Match strategy:
  //   1) exact match on normalised id
  //   2) glob (`*` → any run of [^]) match
  //   3) friendly alias - currently:
  //      cpu.package.temperature → first Temperature sensor whose name contains
  //          "package", "tctl" or "tdie"
  //      cpu.load → first CPU Load sensor (sometimes labelled "CPU Total")
  //      cpu.power → first CPU Power sensor (labelled "CPU Package" power)
  //      gpu.<idx>.temperature → first GPU Temperature on that GPU
  //      gpu.<idx>.load → first GPU Load on that GPU
  //      memory.used → first Memory Data sensor labelled used
  const sensors = [...iterateSensors(frame)];
  if (sensors.length === 0) return null;

  // Exact match.
  const exact = sensors.find((s) => s.id === idPattern);
  if (exact) return exact;

  // Glob.
  if (idPattern.includes('*')) {
    const re = new RegExp('^' + idPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$', 'i');
    const hit = sensors.find((s) => re.test(s.id));
    if (hit) return hit;
  }

  // Friendly aliases (canonical names users put in manifests).
  const ALIASES: Record<string, (s: ResolvedSensorReading) => boolean> = {
    'cpu.package.temperature': (s) => s.type === 'Temperature' && /package|tctl|tdie/i.test(s.name),
    'cpu.package.temp':        (s) => s.type === 'Temperature' && /package|tctl|tdie/i.test(s.name),
    'cpu.load':                (s) => s.type === 'Load' && /total|package/i.test(s.name),
    'cpu.power':               (s) => s.type === 'Power' && /package/i.test(s.name),
    'memory.used':             (s) => s.parentName.toLowerCase().includes('memory') && s.type === 'Data' && /used/i.test(s.name),
    'memory.load':             (s) => s.parentName.toLowerCase().includes('memory') && s.type === 'Load',
  };
  const alias = ALIASES[idPattern];
  if (alias) {
    const hit = sensors.find(alias);
    if (hit) return hit;
  }

  // gpu.<n>.temperature / .load aliases.
  const gpuMatch = idPattern.match(/^gpu\.(\d+)\.(temperature|temp|load)$/i);
  if (gpuMatch) {
    const gpuIdx = parseInt(gpuMatch[1], 10);
    const wantTemp = gpuMatch[2].toLowerCase().startsWith('temp');
    const gpuPrefix = `gpu.`;
    const gpuSensors = sensors.filter((s) => s.id.startsWith(gpuPrefix));
    // Group by parent name to identify "GPU 0" vs "GPU 1".
    const parents = Array.from(new Set(gpuSensors.map((s) => s.parentId)));
    const target = parents[gpuIdx];
    if (target) {
      return gpuSensors.find((s) =>
        s.parentId === target && (wantTemp ? s.type === 'Temperature' : s.type === 'Load'),
      ) ?? null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDataSourcesArgs {
  widgetId: string;
  sources: Record<string, WidgetManifestDataSource> | undefined;
  capabilities: { 'net.fetch'?: string[] } | undefined;
  /** Tier 2 publish payload merged in by binding name. */
  workerPayload?: Record<string, unknown>;
  /**
   * Resolved settings bag. Source spec strings (e.g. sensor name, fetch
   * URL, clock timezone, host action) are run through the binding
   * evaluator against {settings, data: {}} BEFORE the source executes —
   * lets a manifest declare `sensor: "{settings.slot0_device}.{settings.slot0_sensor}"`.
   */
  settings?: Record<string, unknown>;
}

export function useDataSources({
  widgetId,
  sources: rawSources,
  capabilities,
  workerPayload,
  settings,
}: UseDataSourcesArgs): Record<string, ResolvedDataValue> {
  // Pre-resolve binding strings in every source spec against the current
  // settings. Re-runs only when sources OR settings change.
  const sources = useMemo(
    () => resolveSourceBindings(rawSources, settings),
    [JSON.stringify(rawSources), JSON.stringify(settings)], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    monitoringStore.subscribe(fn);
    return () => monitoringStore.unsubscribe(fn);
  }, []);

  const [fetchState, setFetchState] = useState<Record<string, Record<string, unknown> | null>>({});

  // Ticking clock sources. The renderer ticks at the highest-precision
  // cadence any clock source requests (1s default, 500ms allowed, 1m for
  // widgets that only need wall-time). One interval per widget instance.
  const [tickNow, setTickNow] = useState(() => Date.now());
  const clockCadenceMs = useMemo(() => {
    let min = 0;
    for (const source of Object.values(sources ?? {})) {
      if (!source.clock) continue;
      const cad = parseCadence(source.clock.tickEvery ?? '1s') ?? 1000;
      if (min === 0 || cad < min) min = cad;
    }
    return min;
  }, [JSON.stringify(sources)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (clockCadenceMs <= 0) return;
    setTickNow(Date.now());
    const handle = setInterval(() => setTickNow(Date.now()), clockCadenceMs);
    return () => clearInterval(handle);
  }, [clockCadenceMs]);

  // Host-action data sources: poll /widgets-api/dispatch on a refresh
  // schedule and surface the response body under `data.<key>`. Used by
  // first-party widgets that consume host-internal state (e.g. the
  // displays list) without needing a worker.
  useEffect(() => {
    if (!sources) return;
    const stops: Array<() => void> = [];
    for (const [key, source] of Object.entries(sources)) {
      if (!source.host?.action) continue;
      const intervalMs = parseCadence(source.host.refresh) ?? 5_000;
      // Floor at 5 s. Host actions hit local services synchronously
      // (screentime walks the full session log; displays enumerates DDC/CI
      // monitors) — a sub-second cadence is real CPU draw for no UX win.
      const safeMs = Math.max(5_000, intervalMs);
      let cancelled = false;
      // One AbortController per tick. The new tick aborts the previous tick's
      // in-flight request before spinning up its own — otherwise a host action
      // slower than the 5s cadence (e.g. screentime walking the full session
      // log) would leak past, resolve later, and call setHostState on a stale
      // capabilities snapshot. Cleanup aborts whatever's current.
      let currentAbort: AbortController | null = null;
      const tick = async () => {
        if (cancelled) return;
        currentAbort?.abort();
        currentAbort = new AbortController();
        const signal = currentAbort.signal;
        try {
          const body = JSON.stringify({
            widgetId, action: source.host!.action, args: source.host!.args ?? {},
          });
          const token = await getToken();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers.Authorization = `Bearer ${token}`;
          let res = await fetch(resolveHttp('/widgets-api/dispatch'), {
            method: 'POST', headers, body, signal,
          });
          if (res.status === 401) {
            const refreshed = await handleUnauthorized();
            if (refreshed && !signal.aborted) {
              headers.Authorization = `Bearer ${refreshed}`;
              res = await fetch(resolveHttp('/widgets-api/dispatch'), { method: 'POST', headers, body, signal });
            }
          }
          if (!res.ok || cancelled || signal.aborted) return;
          const payload = await res.json() as { ok?: boolean; result?: unknown };
          if (!payload.ok || signal.aborted) return;
          setHostState((prev) => ({ ...prev, [key]: payload.result as Record<string, unknown> | null }));
        } catch (err) {
          // AbortError is expected on cleanup; everything else is swallowed
          // (the renderer keeps showing the previous value).
          if ((err as Error)?.name !== 'AbortError') { /* swallow */ }
        }
      };
      void tick();
      const handle = setInterval(tick, safeMs);
      stops.push(() => {
        cancelled = true;
        clearInterval(handle);
        currentAbort?.abort();
      });
    }
    return () => { for (const s of stops) s(); };
  }, [widgetId, JSON.stringify(sources)]); // eslint-disable-line react-hooks/exhaustive-deps

  const [hostState, setHostState] = useState<Record<string, Record<string, unknown> | null>>({});

  // REST data sources: schedule a refresh per source.
  useEffect(() => {
    if (!sources) return;
    const stops: Array<() => void> = [];
    for (const [key, source] of Object.entries(sources)) {
      if (!source.fetch) continue;
      const intervalMs = parseCadence(source.refresh) ?? 600_000; // 10m default
      const minMs = 30_000;
      const safeMs = Math.max(minMs, intervalMs);

      let cancelled = false;
      let currentAbort: AbortController | null = null;
      const tick = async () => {
        if (cancelled) return;
        currentAbort?.abort();
        currentAbort = new AbortController();
        const signal = currentAbort.signal;
        try {
          const body = {
            widgetId,
            url: source.fetch,
            headers: source.headers,
            // The proxy enforces the allowlist; we pass the manifest's
            // hosts so the host can audit at request time too.
            allowedHosts: capabilities?.['net.fetch'] ?? [],
          };
          const token = await getToken();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers.Authorization = `Bearer ${token}`;
          let res = await fetch(resolveHttp('/widgets-api/proxy'), {
            method: 'POST', headers, body: JSON.stringify(body), signal,
          });
          if (res.status === 401) {
            const next = await handleUnauthorized();
            if (next && !signal.aborted) {
              headers.Authorization = `Bearer ${next}`;
              res = await fetch(resolveHttp('/widgets-api/proxy'), {
                method: 'POST', headers, body: JSON.stringify(body), signal,
              });
            }
          }
          if (!res.ok || signal.aborted) return;
          const payload = await res.json() as { body?: unknown };
          if (cancelled || signal.aborted) return;
          // Apply JSONPath extractors.
          const extracted: Record<string, unknown> = { _raw: payload.body };
          if (source.extract) {
            for (const [k, path] of Object.entries(source.extract)) {
              extracted[k] = jsonPath(payload.body, path);
            }
          }
          setFetchState((prev) => ({ ...prev, [key]: extracted }));
        } catch (err) {
          if ((err as Error)?.name !== 'AbortError') { /* swallow */ }
        }
      };
      // Fire immediately + on cadence.
      void tick();
      const handle = setInterval(tick, safeMs);
      stops.push(() => {
        cancelled = true;
        clearInterval(handle);
        currentAbort?.abort();
      });
    }
    return () => { for (const s of stops) s(); };
  }, [widgetId, JSON.stringify(sources), JSON.stringify(capabilities?.['net.fetch'] ?? [])]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const out: Record<string, ResolvedDataValue> = {};
    const frame = monitoringStore.getMonitoringFrame();
    if (!sources) return out;
    for (const [key, source] of Object.entries(sources)) {
      if (source.sensor) {
        out[key] = pickSensor(frame, source.sensor);
      } else if (source.fetch) {
        out[key] = (fetchState[key] ?? null) as ResolvedDataValue;
      } else if (source.worker) {
        const v = workerPayload?.[source.worker];
        out[key] = v === undefined ? null : (v as ResolvedDataValue);
      } else if (source.clock) {
        out[key] = computeClock(tickNow, source.clock);
      } else if (source.host) {
        out[key] = (hostState[key] ?? null) as ResolvedDataValue;
      } else {
        out[key] = null;
      }
    }
    return out;
  // The bump state + fetchState changes drive recomputation; sources is
  // serialised here only so the array deps remain stable across renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sources), fetchState, workerPayload, tickNow, hostState]);
}

interface ClockReading extends Record<string, unknown> {
  iso: string;
  hour: number;        // 0-23
  hour12: number;      // 1-12
  minute: number;      // 0-59
  second: number;      // 0-59
  ampm: 'AM' | 'PM';
  weekday: string;     // "Mon"
  weekdayLong: string; // "Monday"
  day: number;         // 1-31
  month: string;       // "Jan"
  monthLong: string;   // "January"
  monthNumber: number; // 1-12
  year: number;
  // Pre-formatted display strings.
  time: string;        // "14:23" or "2:23 PM"
  time24: string;      // "14:23"
  time12: string;      // "2:23 PM"
  timeWithSeconds: string;
  date: string;        // "Mon, Jan 15"
  dateLong: string;    // "Monday, January 15, 2026"
  // Clock-face angles for analog designs (degrees, 0 = 12 o'clock).
  hourAngle: number;
  minuteAngle: number;
  secondAngle: number;
  // Continuous milliseconds since midnight, useful for smooth animations.
  msOfDay: number;
}

function computeClock(nowMs: number, spec: NonNullable<WidgetManifestDataSource['clock']>): ClockReading {
  // Per-spec timezone. Intl.DateTimeFormat with a `timeZone` option does
  // the heavy lifting; passing undefined for an empty/missing zone falls
  // back to the user's system zone.
  const tz = spec.timezone && spec.timezone.trim().length > 0 ? spec.timezone : undefined;
  const date = new Date(nowMs);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: 'short', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour24 = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const second = parseInt(get('second'), 10);
  const day = parseInt(get('day'), 10);
  const year = parseInt(get('year'), 10);

  const longParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: 'long', weekday: 'long',
  }).formatToParts(date);
  const monthLong = longParts.find((p) => p.type === 'month')?.value ?? '';
  const weekdayLong = longParts.find((p) => p.type === 'weekday')?.value ?? '';
  const monthNumberPart = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: 'numeric',
  }).formatToParts(date).find((p) => p.type === 'month')?.value ?? '1';

  const hour12Pad = ((hour24 + 11) % 12) + 1;
  const ampm: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const pad = (n: number) => n.toString().padStart(2, '0');

  const time24 = `${pad(hour24)}:${pad(minute)}`;
  const time12 = `${hour12Pad}:${pad(minute)} ${ampm}`;
  const timeWithSeconds = `${pad(hour24)}:${pad(minute)}:${pad(second)}`;
  const useHour12 = spec.hour12 === true;
  const time = useHour12 ? time12 : time24;

  // Continuous fractional seconds for smooth clock-hand motion.
  const fracSeconds = (nowMs % 1000) / 1000;
  const secondsCont = second + fracSeconds;
  const minutesCont = minute + secondsCont / 60;
  const hoursCont = (hour24 % 12) + minutesCont / 60;
  // 12 o'clock is 0° (rotation origin); each hour = 30°, each minute = 6°.
  const hourAngle = hoursCont * 30;
  const minuteAngle = minutesCont * 6;
  const secondAngle = secondsCont * 6;

  return {
    iso: date.toISOString(),
    hour: hour24,
    hour12: hour12Pad,
    minute,
    second,
    ampm,
    weekday: get('weekday'),
    weekdayLong,
    day,
    month: get('month'),
    monthLong,
    monthNumber: parseInt(monthNumberPart, 10),
    year,
    time,
    time24,
    time12,
    timeWithSeconds,
    date: `${get('weekday')}, ${get('month')} ${day}`,
    dateLong: `${weekdayLong}, ${monthLong} ${day}, ${year}`,
    hourAngle,
    minuteAngle,
    secondAngle,
    msOfDay: hour24 * 3_600_000 + minute * 60_000 + second * 1000 + (nowMs % 1000),
  };
}

/**
 * Walk every source spec, replace any string field that's a binding
 * template (`"{settings.x}"` / interpolation) with its evaluated value.
 * Lets a manifest dynamically pick which sensor a slot reads based on
 * the user's per-slot settings, without needing per-slot static keys.
 *
 * Only string fields are bound — numbers/booleans pass through. The
 * binding context exposes `settings` only (no `data` — sources can't
 * depend on each other yet).
 */
function resolveSourceBindings(
  sources: Record<string, WidgetManifestDataSource> | undefined,
  settings: Record<string, unknown> | undefined,
): Record<string, WidgetManifestDataSource> | undefined {
  if (!sources) return sources;
  if (!settings) return sources;
  const ctx = { settings, data: {} } as unknown as BindingContext;
  const out: Record<string, WidgetManifestDataSource> = {};
  for (const [key, src] of Object.entries(sources)) {
    out[key] = bindSource(src, ctx);
  }
  return out;
}

function bindSource(src: WidgetManifestDataSource, ctx: BindingContext): WidgetManifestDataSource {
  const next: WidgetManifestDataSource = { ...src };
  if (typeof src.sensor === 'string') next.sensor = bindStr(src.sensor, ctx);
  if (typeof src.fetch === 'string') next.fetch = bindStr(src.fetch, ctx);
  if (typeof src.refresh === 'string') next.refresh = bindStr(src.refresh, ctx);
  if (src.headers) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(src.headers)) headers[k] = bindStr(v, ctx);
    next.headers = headers;
  }
  if (src.clock) {
    next.clock = { ...src.clock };
    if (typeof src.clock.timezone === 'string') next.clock.timezone = bindStr(src.clock.timezone, ctx);
  }
  if (src.host) {
    next.host = { ...src.host };
    if (typeof src.host.action === 'string') next.host.action = bindStr(src.host.action, ctx);
    if (typeof src.host.refresh === 'string') next.host.refresh = bindStr(src.host.refresh, ctx);
    if (src.host.args) {
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(src.host.args)) {
        args[k] = typeof v === 'string' ? evaluateBinding(v, ctx) : v;
      }
      next.host.args = args;
    }
  }
  return next;
}

function bindStr(s: string, ctx: BindingContext): string {
  const v = evaluateBinding(s, ctx);
  return v == null ? '' : String(v);
}

function parseCadence(cadence: string | undefined): number | null {
  if (!cadence) return null;
  const m = cadence.match(/^(\d+)\s*(ms|s|m|h)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  switch (unit) {
    case 'ms': return n;
    case 's': return n * 1000;
    case 'm': return n * 60_000;
    case 'h': return n * 3_600_000;
  }
  return null;
}
