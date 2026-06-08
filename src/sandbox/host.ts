// Host-side spawn for a sandboxed SDK widget. Boots the worker (reusing the
// hardened declarative boot), hands it a dedicated UI MessagePort, and drives its
// React tree over @quilted/threads into a RemoteReceiver the host renders.

import { RemoteReceiver } from '@remote-dom/core/receivers';
import type { RemoteConnection } from '@remote-dom/core';
import { ThreadMessagePort, retain, release } from '@quilted/threads';
import { composeSdkWorkerSource } from './sandboxBoot';
import { proxyFetch } from '../widgets/declarative/proxyClient';
import { flattenFrameForWorker, type FlatReading } from '../widgets/declarative/sensorFlatten';
import * as monitoringStore from '../lib/monitoringStore';

function globToRegex(pattern: string): RegExp {
  return new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$', 'i');
}

export interface SandboxContext {
  instanceId: string;
  widgetId: string;
  size: { width: number; height: number };
  settings: Record<string, unknown>;
  local: Record<string, unknown>;
  /** Cert/manifest net.fetch host allowlist; the host services the worker's
   *  brokered `nexus.net.fetch` through the SSRF-guarded proxy. */
  netFetch?: string[];
  /** Cert/manifest sensors.read pattern allowlist (e.g. ["cpu.*"]). The host
   *  delivers only readings matching a granted pattern. Empty = no sensors. */
  sensorsRead?: string[];
  api: {
    persistLocal(next: Record<string, unknown>): void;
    /** Host-brokered action: POSTs /widgets-api/dispatch (relay-aware), returns
     *  the `{ ok, result }` envelope. Powers control writes AND host-action data
     *  sources (e.g. screentime.today). The action must be in the manifest's
     *  capabilities.dispatch allowlist. */
    dispatch(action: string, args?: Record<string, unknown>): Promise<unknown>;
  };
}

export interface SandboxPatch {
  settings?: Record<string, unknown>;
  size?: { width: number; height: number };
}

export interface SandboxHandle {
  receiver: RemoteReceiver;
  update(patch: SandboxPatch): void;
  dispose(): void;
}

interface RemoteWidgetImports {
  render(connection: RemoteConnection, context: SandboxContext): Promise<void>;
  update(patch: SandboxPatch): Promise<void>;
}

export function spawnSandboxedWidget(entryUrl: string, context: SandboxContext): SandboxHandle {
  const source = composeSdkWorkerSource(entryUrl);
  const blob = new Blob([source], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  const worker = new Worker(blobUrl, { type: 'module', name: `sdk:${context.widgetId}` });
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

  // Surface worker faults/logs to the host console (worker console output does
  // not otherwise reach the page). The UI rides the threads port, but nexus.*
  // diagnostics still come over the worker's main channel.
  worker.addEventListener('error', (e) => {
    console.error(`[sdk:${context.widgetId}] worker error`, e.message, e.filename, e.lineno);
  });

  // Sensor broker — mirrors the declarative host, capped to the manifest's
  // sensors.read grant (the declarative host does NOT enforce this; the SDK does).
  const allowedSensors = (context.sensorsRead ?? []).map(globToRegex);
  const isGranted = (id: string) => allowedSensors.some((re) => re.test(id));
  const sensorSubs = new Map<number, RegExp>();
  const findReading = (id: string): FlatReading | null => {
    const frame = monitoringStore.getMonitoringFrame();
    return frame ? (flattenFrameForWorker(frame).find((s) => s.id === id) ?? null) : null;
  };
  const fanoutSensors = () => {
    if (sensorSubs.size === 0) return;
    const frame = monitoringStore.getMonitoringFrame();
    if (!frame) return;
    for (const reading of flattenFrameForWorker(frame)) {
      if (!isGranted(reading.id)) continue;
      for (const [subId, re] of sensorSubs) {
        if (re.test(reading.id)) worker.postMessage({ type: 'nexus.sensors.reading', payload: { subscriptionId: subId, reading } });
      }
    }
  };
  const onFrame = () => fanoutSensors();
  monitoringStore.subscribe(onFrame);

  worker.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; id?: number; message?: string; payload?: unknown } | null;
    if (d?.type === 'nexus.error') { console.error(`[sdk:${context.widgetId}]`, d.message); return; }
    if (d?.type === 'nexus.log') { console.warn(`[sdk:${context.widgetId}]`, d.payload); return; }
    if (d?.type === 'nexus.sensors.read' && typeof d.id === 'number') {
      const p = d.payload as { id?: string } | undefined;
      worker.postMessage({ type: 'nexus.reply', id: d.id, result: p?.id && isGranted(p.id) ? findReading(p.id) : null });
      return;
    }
    if (d?.type === 'nexus.sensors.subscribe') {
      const p = d.payload as { pattern?: string; subscriptionId?: number } | undefined;
      if (p?.subscriptionId && p?.pattern) { sensorSubs.set(p.subscriptionId, globToRegex(p.pattern)); fanoutSensors(); }
      return;
    }
    if (d?.type === 'nexus.sensors.unsubscribe') {
      const p = d.payload as { subscriptionId?: number } | undefined;
      if (p?.subscriptionId) sensorSubs.delete(p.subscriptionId);
      return;
    }
    if (d?.type === 'nexus.net.fetch' && typeof d.id === 'number') {
      const req = (d.payload ?? {}) as { url?: string; method?: string; headers?: Record<string, string>; body?: string };
      const id = d.id;
      if (!req.url) return;
      void proxyFetch(context.widgetId, { url: req.url, method: req.method, headers: req.headers, body: req.body }, context.netFetch ?? [])
        .then((result) => worker.postMessage({ type: 'nexus.reply', id, result }))
        .catch((err: unknown) => worker.postMessage({ type: 'nexus.reply', id, error: { code: -32001, message: String(err) } }));
    }
  });

  const channel = new MessageChannel();
  worker.postMessage({ type: 'nexus.ui.port' }, [channel.port2]);

  // Resolve the worker's nexus.ready (the boot blocks on this) so any nexus.*
  // usage works. The SDK's primary surface rides the threads context, but this
  // closes the gap with the declarative host.
  worker.postMessage({
    type: 'nexus.welcome',
    payload: { widgetId: context.widgetId, netFetch: context.netFetch ?? [], settings: context.settings ?? {} },
  });

  const receiver = new RemoteReceiver({ retain, release });
  const remote = ThreadMessagePort.import<RemoteWidgetImports>(channel.port1);
  channel.port1.start();

  let disposed = false;
  void Promise.resolve(remote.render(receiver.connection, context)).catch((err: unknown) => {
    console.error(`[sdk:${context.widgetId}] render failed`, err);
  });

  return {
    receiver,
    update: (patch) => { if (!disposed) void remote.update(patch); },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      monitoringStore.unsubscribe(onFrame);
      sensorSubs.clear();
      try { worker.terminate(); } catch { /* ignore */ }
      try { channel.port1.close(); } catch { /* ignore */ }
    },
  };
}
