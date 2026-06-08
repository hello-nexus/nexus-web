// Tier 2 worker host. Spawns a module Web Worker per widget instance whose
// manifest declares `capabilities.code === "worker"`, installs the nexus.*
// surface on the worker side, proxies network through the host's
// /widgets-api/proxy endpoint, and listens for `nexus.publish` to feed the
// declarative renderer.
//
// Multi-file workers: the host POSTs to /widgets-api/installed/{id}/code-session
// to mint a short-lived URL-path token, then composes a boot Blob that
// dynamic-imports the author entry from `/widgets-api/code/{token}/worker.js`.
// Sibling `import "./lib/x.js"` statements inherit the session prefix
// automatically because the browser resolves relative imports against the
// importing module's URL, so authors get native ESM without us needing to
// thread Bearer auth through the loader.

import { getToken, handleUnauthorized } from '../../api/auth';
import { resolveHttp } from '../../api/service';
import * as monitoringStore from '../../lib/monitoringStore';
import { workerBootScript } from './workerBoot';
import { proxyFetch } from './proxyClient';

interface WorkerOptions {
  widgetId: string;
  netFetchAllowlist: string[];
  onPublish: (payload: Record<string, unknown>) => void;
  onLog?: (level: string, message: string, data?: unknown) => void;
}

interface RpcInbound {
  type: string;
  id?: number;
  // Subscribe payloads vary per method - kept loose; the host narrows
  // per `type` branch.
  payload?: unknown;
}

interface RpcOutbound {
  type: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
  notification?: { method: string; params: unknown };
}

export interface WidgetWorkerHandle {
  /** Re-issue the most recent settings snapshot to the worker. */
  pushSettings(values: Record<string, unknown>): void;
  /** Re-run the worker's most recent every() callback. */
  refresh(): void;
  /** Stop the worker and detach all listeners. */
  dispose(): void;
}

export function spawnWidgetWorker(opts: WorkerOptions): WidgetWorkerHandle {
  const handle: WidgetWorkerHandle = {
    pushSettings: () => { /* set later */ },
    refresh: () => { /* set later */ },
    dispose: () => { /* set later */ },
  };
  let worker: Worker | null = null;
  let disposed = false;
  let blobUrlToRevoke: string | null = null;
  const nextRpcId = 1;
  const pending = new Map<number, (value: unknown, error?: { code: number; message: string }) => void>();
  const sensorSubscribers = new Map<number, { pattern: string; regex: RegExp }>();
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let lastPublishAt = Date.now();
  let pendingSettings: Record<string, unknown> | null = null;

  (async () => {
    // 1. Mint a code session. The token in the URL path is the auth surface
    //    for the module loader's sibling fetches, so this MUST go through
    //    the host before any worker construction.
    const session = await acquireCodeSession(opts.widgetId);
    if (!session) {
      opts.onLog?.('error', 'failed to acquire widget code session');
      return;
    }
    if (disposed) return;

    // 2. Compose a module-mode boot Blob. The boot script installs nexus.*
    //    and kills privileged globals, then dynamic-imports the author
    //    entry under the session URL. Sibling imports inside the entry
    //    inherit the session prefix automatically.
    const entryUrl = new URL(`${session.baseUrl}/worker.js`, window.location.origin).toString();
    const composed = `${workerBootScript()}
import(${JSON.stringify(entryUrl)}).catch(function (err) {
  self.postMessage({ type: 'nexus.error', message: String(err && err.message || err) });
});
`;
    const blob = new Blob([composed], { type: 'application/javascript' });
    blobUrlToRevoke = URL.createObjectURL(blob);
    worker = new Worker(blobUrlToRevoke, { name: `widget:${opts.widgetId}`, type: 'module' });
    // Revoke after the worker has had a chance to fetch the boot Blob.
    // Some engines need the URL alive until the first script byte is read.
    setTimeout(() => {
      if (blobUrlToRevoke) {
        URL.revokeObjectURL(blobUrlToRevoke);
        blobUrlToRevoke = null;
      }
    }, 2000);

    worker.addEventListener('message', (ev: MessageEvent<RpcInbound | RpcOutbound>) => {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object') return;

      // RPC reply to a host-initiated call — unused; host calls go via
      // opts/handle directly. Workers notify; the host responds to worker RPCs.
      if ('result' in msg || 'error' in msg) {
        // not used
        return;
      }

      const inbound = msg as RpcInbound;
      switch (inbound.type) {
        case 'nexus.publish': {
          const payload = inbound.payload as Record<string, unknown> | undefined;
          lastPublishAt = Date.now();
          if (payload) opts.onPublish(payload);
          break;
        }
        case 'nexus.log': {
          const p = inbound.payload as { level?: string; message?: string; data?: unknown } | undefined;
          opts.onLog?.(p?.level ?? 'info', p?.message ?? '', p?.data);
          break;
        }
        case 'nexus.net.fetch': {
          void handleNetFetch(inbound, worker!, opts);
          break;
        }
        case 'nexus.sensors.read': {
          const p = inbound.payload as { id?: string } | undefined;
          const result = readSensor(p?.id ?? '');
          if (inbound.id !== undefined && worker) {
            worker.postMessage({ type: 'nexus.reply', id: inbound.id, result });
          }
          break;
        }
        case 'nexus.sensors.subscribe': {
          const p = inbound.payload as { pattern?: string; subscriptionId?: number } | undefined;
          if (p?.subscriptionId && p?.pattern) {
            sensorSubscribers.set(p.subscriptionId, {
              pattern: p.pattern,
              regex: new RegExp('^' + p.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$', 'i'),
            });
            // Fire immediately with current readings.
            fanoutSensorReadings(worker!);
          }
          break;
        }
        case 'nexus.sensors.unsubscribe': {
          const p = inbound.payload as { subscriptionId?: number } | undefined;
          if (p?.subscriptionId) sensorSubscribers.delete(p.subscriptionId);
          break;
        }
      }
    });

    worker.addEventListener('error', (ev) => {
      opts.onLog?.('error', `worker error: ${ev.message}`);
    });

    // Initial bootstrap: tell the worker its initial settings + sensor
    // catalog seed (so authors can read settings synchronously).
    worker.postMessage({
      type: 'nexus.welcome',
      payload: {
        widgetId: opts.widgetId,
        netFetch: opts.netFetchAllowlist,
        settings: pendingSettings ?? {},
      },
    });

    handle.pushSettings = (values) => {
      pendingSettings = values;
      worker?.postMessage({ type: 'nexus.settings.changed', payload: values });
    };
    handle.refresh = () => {
      worker?.postMessage({ type: 'nexus.refresh' });
    };

    // Fan out monitoring frames to subscribed worker patterns.
    const onFrame = () => fanoutSensorReadings(worker!);
    monitoringStore.subscribe(onFrame);

    // Watchdog: terminate if no publish for 60 s.
    watchdog = setInterval(() => {
      if (Date.now() - lastPublishAt > 60_000) {
        opts.onLog?.('warn', 'worker watchdog: no publish in 60s, terminating');
        handle.dispose();
      }
    }, 10_000);

    const teardown = () => {
      monitoringStore.unsubscribe(onFrame);
      if (watchdog) clearInterval(watchdog);
      watchdog = null;
      try { worker?.terminate(); } catch { /* swallow */ }
      worker = null;
      pending.clear();
      sensorSubscribers.clear();
    };
    handle.dispose = () => {
      if (disposed) return;
      disposed = true;
      teardown();
    };
  })();

  function fanoutSensorReadings(w: Worker) {
    if (!w || sensorSubscribers.size === 0) return;
    const frame = monitoringStore.getMonitoringFrame();
    if (!frame) return;
    const flat = flattenFrameForWorker(frame);
    for (const reading of flat) {
      for (const [subId, sub] of sensorSubscribers) {
        if (sub.regex.test(reading.id)) {
          w.postMessage({ type: 'nexus.sensors.reading', payload: { subscriptionId: subId, reading } });
        }
      }
    }
  }

  function readSensor(id: string) {
    const frame = monitoringStore.getMonitoringFrame();
    if (!frame) return null;
    return flattenFrameForWorker(frame).find((s) => s.id === id) ?? null;
  }

  void nextRpcId; // reserved for future host→worker RPC needs

  return handle;
}

interface FlatReading {
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

function flattenFrameForWorker(frame: import('../../hooks/useMonitoringFrame').MonitoringFrame): FlatReading[] {
  const out: FlatReading[] = [];
  const now = Date.now();
  const push = (family: string, c: { id?: string; name?: string; sensors?: Array<{ id: string; name?: string; type?: string; units?: string; value?: number; formatted?: string }> } | null | undefined) => {
    if (!c) return;
    const parentId = normaliseId(family, c.id ?? family);
    for (const s of c.sensors ?? []) {
      out.push({
        id: normaliseId(family, s.id),
        name: s.name ?? '',
        type: s.type ?? '',
        units: s.units ?? '',
        value: typeof s.value === 'number' ? s.value : 0,
        formatted: s.formatted ?? String(s.value ?? ''),
        parentId,
        parentName: c.name ?? '',
        timestamp: now,
      });
    }
  };
  push('cpu', frame.cpu);
  if (frame.gpu) for (const g of frame.gpu) push('gpu', g);
  push('memory', frame.memory);
  push('motherboard', frame.motherboard);
  if (frame.storage) for (const drive of Object.values(frame.storage)) push('storage', drive);
  return out;
}

function normaliseId(family: string, raw: string): string {
  const cleaned = raw.toLowerCase()
    .replace(/^[/.]+/, '')
    .replace(/[/\\:\s]+/g, '.')
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/\.+/g, '.');
  if (cleaned.length === 0) return family;
  if (cleaned.startsWith(family + '.') || cleaned === family) return cleaned;
  return `${family}.${cleaned}`;
}

interface CodeSession { sessionId: string; baseUrl: string; }

async function acquireCodeSession(widgetId: string): Promise<CodeSession | null> {
  const url = `/widgets-api/installed/${encodeURIComponent(widgetId)}/code-session`;
  const doPost = async (token: string | null) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(resolveHttp(url), { method: 'POST', headers });
  };
  try {
    let res = await doPost(await getToken());
    if (res.status === 401) {
      const refreshed = await handleUnauthorized();
      if (refreshed) res = await doPost(refreshed);
    }
    if (!res.ok) return null;
    const body = await res.json() as { sessionId?: string; baseUrl?: string; error?: string };
    if (!body?.sessionId || !body?.baseUrl) return null;
    return { sessionId: body.sessionId, baseUrl: body.baseUrl };
  } catch {
    return null;
  }
}

async function handleNetFetch(msg: RpcInbound, worker: Worker, opts: WorkerOptions): Promise<void> {
  const p = msg.payload as {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } | undefined;
  if (!p?.url || !msg.id) return;
  try {
    const payload = await proxyFetch(
      opts.widgetId,
      { url: p.url, method: p.method, headers: p.headers, body: p.body },
      opts.netFetchAllowlist,
    );
    worker.postMessage({ type: 'nexus.reply', id: msg.id, result: payload });
  } catch (err) {
    worker.postMessage({ type: 'nexus.reply', id: msg.id, error: { code: -32001, message: String(err) } });
  }
}
