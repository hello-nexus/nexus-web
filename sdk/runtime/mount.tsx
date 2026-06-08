// Polyfill must initialize before react-dom: this import runs first in the
// bundle's module graph, installing window/document/customElements in the worker.
import '@remote-dom/core/polyfill';

import { createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { ThreadMessagePort } from '@quilted/threads';
import type { RemoteConnection } from '@remote-dom/core';
import { registerElements } from './elements';
import { ContextProvider, createStore, type WidgetContextInit, type WidgetStore } from './context';

declare global {
  var __nexus_ui_port: MessagePort | undefined;
  var __nexus_ui_port_ready: Promise<MessagePort> | undefined;
}

/**
 * Entry point every SDK widget calls with its root component. Waits for the host
 * to hand over the UI MessagePort, then exposes `render`/`update` over threads so
 * the host can drive the worker's React tree and reconcile it into real
 * `@hellonexus/ui` components.
 */
export async function mount(App: ComponentType): Promise<void> {
  registerElements();
  const ready = globalThis.__nexus_ui_port_ready
    ?? (globalThis.__nexus_ui_port ? Promise.resolve(globalThis.__nexus_ui_port) : null);
  if (!ready) {
    globalThis.nexus?.log('error', '[sdk] no UI port handed to the worker; cannot render');
    return;
  }
  const port = await ready;
  let store: WidgetStore | null = null;

  ThreadMessagePort.export(port, {
    render(connection: RemoteConnection, init: WidgetContextInit) {
      store = createStore(init);
      const rootEl = document.createElement('remote-root') as unknown as {
        connect(c: RemoteConnection): void;
      } & Node;
      rootEl.connect(connection);
      document.body.appendChild(rootEl);
      createRoot(rootEl as unknown as Element).render(
        createElement(ContextProvider, { store }, createElement(App)),
      );
    },
    update(patch: { settings?: Record<string, unknown>; size?: { width: number; height: number } }) {
      store?.update(patch);
    },
  });
  port.start?.();
}
