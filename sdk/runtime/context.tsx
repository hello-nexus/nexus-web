// Worker-side widget context store. The host pushes the initial context
// (settings, size, persisted local state, host API callbacks) through the
// @quilted/threads `render` call, and pushes later settings/size changes via
// `update`. Hooks read this store; it is the single bridge between the host's
// React-19 panel and the author's React-18 worker tree.

import { createContext, createElement, useContext, type ReactNode } from 'react';

export interface WidgetHostApi {
  /** Persist the widget's per-instance local-state bag (host -> localStorage). */
  persistLocal(next: Record<string, unknown>): void | Promise<void>;
  /** Host-brokered action (host -> /widgets-api/dispatch). Returns the
   *  `{ ok, result }` envelope so the same call powers control writes and
   *  host-action data sources. */
  dispatch(action: string, args?: Record<string, unknown>): Promise<unknown>;
}

export interface WidgetContextInit {
  instanceId: string;
  widgetId: string;
  size: { width: number; height: number };
  settings: Record<string, unknown>;
  local: Record<string, unknown>;
  api: WidgetHostApi;
}

export interface WidgetState {
  settings: Record<string, unknown>;
  size: { width: number; height: number };
  local: Record<string, unknown>;
}

export interface WidgetStore {
  readonly instanceId: string;
  readonly widgetId: string;
  readonly api: WidgetHostApi;
  getSnapshot(): WidgetState;
  subscribe(cb: () => void): () => void;
  update(patch: Partial<Pick<WidgetState, 'settings' | 'size'>>): void;
  setLocal(next: Record<string, unknown>): void;
}

export function createStore(init: WidgetContextInit): WidgetStore {
  let state: WidgetState = {
    settings: init.settings ?? {},
    size: init.size ?? { width: 0, height: 0 },
    local: init.local ?? {},
  };
  const subs = new Set<() => void>();
  const emit = () => { for (const cb of subs) cb(); };
  return {
    instanceId: init.instanceId,
    widgetId: init.widgetId,
    api: init.api,
    getSnapshot: () => state,
    subscribe: (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    update: (patch) => { state = { ...state, ...patch }; emit(); },
    setLocal: (next) => { state = { ...state, local: next }; void init.api.persistLocal(next); emit(); },
  };
}

const StoreContext = createContext<WidgetStore | null>(null);

export function ContextProvider({ store, children }: { store: WidgetStore; children: ReactNode }) {
  return createElement(StoreContext.Provider, { value: store }, children);
}

export function useStore(): WidgetStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('@hellonexus/sdk hooks must run inside a mounted widget');
  return store;
}
