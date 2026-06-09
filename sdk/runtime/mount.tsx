// Polyfills must initialize before react-dom. Core installs window/document/
// customElements; the react polyfill then patches the bits react-dom probes
// (Element.style/CSSStyleDeclaration, HTMLIFrameElement, location, navigator).
// Order matters: core first.
import '@remote-dom/core/polyfill';
import '@remote-dom/react/polyfill';

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

/** A widget that renders one tree for both surfaces, or distinct trees per
 *  surface. `page` is the expanded full view; absent = the widget has no page. */
export interface WidgetSurfaces {
  cell: ComponentType;
  page?: ComponentType;
}

/**
 * Entry point every SDK widget calls with its root component(s). Waits for the
 * host to hand over the UI MessagePort, then exposes `render`/`update` over
 * threads so the host can drive the worker's React tree and reconcile it into
 * real `@hellonexus/ui` components.
 *
 * `mount(App)` renders App for every surface. `mount({ cell, page })` renders
 * the surface the host asked for (init.surface) — the page worker is a separate
 * render of the same bundle, so a widget keeps one codebase across both views.
 */
export async function mount(app: ComponentType | WidgetSurfaces): Promise<void> {
  const surfaces: WidgetSurfaces = typeof app === 'function' ? { cell: app } : app;
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
      const App = (init.surface === 'page' ? surfaces.page : surfaces.cell) ?? surfaces.cell;
      const rootEl = document.createElement('remote-root') as unknown as {
        connect(c: RemoteConnection): void;
      } & Node;
      rootEl.connect(connection);
      document.body.appendChild(rootEl);
      createRoot(rootEl as unknown as Element).render(
        createElement(ContextProvider, { store, children: createElement(App) }),
      );
    },
    update(patch: { settings?: Record<string, unknown>; size?: { width: number; height: number } }) {
      store?.update(patch);
    },
  });
  port.start?.();
}
