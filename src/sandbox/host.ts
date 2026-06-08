// Host-side spawn for a sandboxed SDK widget. Boots the worker (reusing the
// hardened declarative boot), hands it a dedicated UI MessagePort, and drives its
// React tree over @quilted/threads into a RemoteReceiver the host renders.

import { RemoteReceiver } from '@remote-dom/core/receivers';
import type { RemoteConnection } from '@remote-dom/core';
import { ThreadMessagePort, retain, release } from '@quilted/threads';
import { composeSdkWorkerSource } from './sandboxBoot';

export interface SandboxContext {
  instanceId: string;
  widgetId: string;
  size: { width: number; height: number };
  settings: Record<string, unknown>;
  local: Record<string, unknown>;
  api: {
    persistLocal(next: Record<string, unknown>): void;
    dispatch(action: string, args?: Record<string, unknown>): void | Promise<void>;
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
  worker.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; message?: string; payload?: unknown } | null;
    if (d?.type === 'nexus.error') console.error(`[sdk:${context.widgetId}]`, d.message);
    else if (d?.type === 'nexus.log') console.warn(`[sdk:${context.widgetId}]`, d.payload);
  });

  const channel = new MessageChannel();
  worker.postMessage({ type: 'nexus.ui.port' }, [channel.port2]);

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
      try { worker.terminate(); } catch { /* ignore */ }
      try { channel.port1.close(); } catch { /* ignore */ }
    },
  };
}
