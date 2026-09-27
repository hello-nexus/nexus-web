// Worker-side widget context store. The host pushes the initial context
// (settings, size, persisted local state, host API callbacks) through the
// @quilted/threads `render` call, and pushes later settings/size changes via
// `update`. Hooks read this store; it is the single bridge between the host's
// React-19 panel and the author's React-18 worker tree.

import { createContext, createElement, useContext, type ReactNode } from 'react';

export interface AppDataDoc {
  revision: number;
  updatedAt: string;
  data: unknown;
}

export type AppDataPutResult =
  | { ok: true; revision: number; updatedAt: string }
  | { ok: false; revision: number; updatedAt: string; data: unknown };

export interface WidgetHostApi {
  /** Persist the widget's per-instance local-state bag (host -> localStorage). */
  persistLocal(next: Record<string, unknown>): void | Promise<void>;
  /** Host-brokered action (host -> /apps-api/dispatch). Returns the
   *  `{ ok, result }` envelope so the same call powers control writes and
   *  host-action data sources. */
  dispatch(action: string, args?: Record<string, unknown>): Promise<unknown>;
  /** Closes the panel's fullscreen immersive view this worker renders into
   *  (animated, host-owned). Absent outside the immersive view. */
  exitImmersive?(): void;
  /** Opens this widget's own fullscreen immersive view (host-owned). Absent
   *  when the host can't open one for this render: not on a panel, already
   *  immersive, the app manifest lacks `immersive: true`, or a preview. */
  enterImmersive?(): void;
  /** Reads the app's shared `{appId}/{key}` document (host -> GET
   *  /apps-api/data/{appId}/{key}). The host binds appId; absent when the
   *  manifest lacks `capabilities.appData` or this render is a preview. */
  appDataGet?(key: string): Promise<AppDataDoc>;
  /** Compare-and-swap write of the app's shared document (host -> PUT
   *  /apps-api/data/{appId}/{key}). Absent under the same conditions as
   *  appDataGet. */
  appDataPut?(key: string, baseRevision: number, data: unknown): Promise<AppDataPutResult>;
}

export type WidgetSurface = 'cell' | 'page';

/** The tile's actual shape. Only round glass (the Kraken LCD) masks to a
 *  circle; every other placement is rect. */
export type WidgetDisplayShape = 'rect' | 'round';
/** The operator's input method at this panel surface: direct touch (Y70/
 *  phone), mouse ('pointer', the desktop dashboard), or none (cooler glass,
 *  the Q-series - display-only). */
export type WidgetDisplayInput = 'touch' | 'pointer' | 'none';

export interface WidgetDisplay {
  shape: WidgetDisplayShape;
  input: WidgetDisplayInput;
  /** The panel grid cells a tile spans; absent in the immersive view, the page view, a preview and from an older host. */
  cells?: { cols: number; rows: number };
}

export interface WidgetContextInit {
  instanceId: string;
  widgetId: string;
  /** Which surface this render drives: the panel tile ('cell') or the expanded
   *  full view ('page'). Static for the life of a render. Default 'cell'. */
  surface?: WidgetSurface;
  /** Catalog preview render: host I/O is stubbed; default false. */
  preview?: boolean;
  /** Host is a DEV_TOOLS build; default false. */
  devTools?: boolean;
  /** This worker renders the panel's fullscreen immersive view; default false. */
  immersive?: boolean;
  /** Static for the render; host-computed from the panel surface + widget
   *  size. Defaults to rect/pointer when the host omits it. */
  display?: WidgetDisplay;
  /** Nexus's UI language as a BCP 47 tag; 'en' from a host that omits it. */
  locale?: string;
  size: { width: number; height: number };
  settings: Record<string, unknown>;
  local: Record<string, unknown>;
  api: WidgetHostApi;
}

export interface WidgetState {
  settings: Record<string, unknown>;
  size: { width: number; height: number };
  local: Record<string, unknown>;
  /** Per-key app-data cache. A key absent from this map has never been read
   *  yet (useAppData's `ready` stays false); a present key holds the last
   *  known document, including the `{ revision: 0, data: null }` absent doc. */
  appData: Record<string, AppDataDoc>;
  /** Reactive, unlike surface/preview/devTools/immersive: a promoted
   *  monitor's touch digitizer can be detected after the worker spawns, so
   *  the host pushes a later change through `update` rather than baking it
   *  in once at spawn. */
  display: WidgetDisplay;
  /** Reactive: the user can switch Nexus's language while the widget runs. */
  locale: string;
}

export interface WidgetStorePatch extends Partial<Pick<WidgetState, 'settings' | 'size' | 'display' | 'locale'>> {
  /** A pushed or freshly-read app-data document for one key. */
  appData?: { key: string } & AppDataDoc;
}

export interface WidgetStore {
  readonly instanceId: string;
  readonly widgetId: string;
  readonly surface: WidgetSurface;
  readonly preview: boolean;
  readonly devTools: boolean;
  readonly immersive: boolean;
  readonly api: WidgetHostApi;
  getSnapshot(): WidgetState;
  subscribe(cb: () => void): () => void;
  update(patch: WidgetStorePatch): void;
  setLocal(next: Record<string, unknown>): void;
  /** Applies a document to the app-data cache, ignoring any revision not
   *  strictly newer than the one already held (a push racing a local read). */
  applyAppData(key: string, doc: AppDataDoc): void;
}

export function createStore(init: WidgetContextInit): WidgetStore {
  let state: WidgetState = {
    settings: init.settings ?? {},
    size: init.size ?? { width: 0, height: 0 },
    local: init.local ?? {},
    appData: {},
    display: init.display ?? { shape: 'rect', input: 'pointer' },
    locale: init.locale ?? 'en',
  };
  const subs = new Set<() => void>();
  const emit = () => { for (const cb of subs) cb(); };
  const applyAppData = (key: string, doc: AppDataDoc) => {
    const current = state.appData[key];
    if (current && doc.revision <= current.revision) return;
    state = { ...state, appData: { ...state.appData, [key]: doc } };
    emit();
  };
  return {
    instanceId: init.instanceId,
    widgetId: init.widgetId,
    surface: init.surface ?? 'cell',
    preview: init.preview ?? false,
    devTools: init.devTools ?? false,
    immersive: init.immersive ?? false,
    api: init.api,
    getSnapshot: () => state,
    subscribe: (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    update: (patch) => {
      const { appData, ...rest } = patch;
      if (Object.keys(rest).length > 0) { state = { ...state, ...rest }; emit(); }
      if (appData) { const { key, ...doc } = appData; applyAppData(key, doc); }
    },
    setLocal: (next) => { state = { ...state, local: next }; void init.api.persistLocal(next); emit(); },
    applyAppData,
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
