import { useEffect, useMemo, useRef, useState } from 'react';
import { WidgetSettingsBridge } from '../settingsBridge';
import type { WidgetInstalledListing, WidgetView } from '../types';
import { useDataSources } from './dataSources';
import { renderView } from './renderer';
import { spawnWidgetWorker, type WidgetWorkerHandle } from './workerHost';
import { WidgetEmptyState } from './WidgetEmptyState';
import { resolveLocalUpdateArgs, useWidgetLocalState } from './localState';
import {
  loadCachedWorkerPayload,
  saveCachedWorkerPayload,
} from './payloadCache';
import { loadWidgetFonts } from './fontLoader';
import styles from './DeclarativeWidget.module.scss';

export interface DeclarativeWidgetProps {
  listing: WidgetInstalledListing;
  /** Panel grid size (`2x2`, `4x2`, etc.). When the manifest's `view`
   *  block is a per-size map (`{ "2x2": ..., "4x2": ... }`), the renderer
   *  selects the matching variant. */
  size: string;
  /** Per-instance id (from the panel layout). Plumbed to the renderer so
   *  meters that key state (e.g. sparkline ring buffers) don't collide
   *  across multiple copies of the same widget. */
  instanceId: string;
}

/**
 * Top-level renderer for a declarative marketplace widget. Wires up:
 *
 *   1. The settings bridge (persisted on qos-service).
 *   2. The data resolver (sensor + REST + worker passthrough).
 *   3. The optional Tier 2 Worker host when the manifest declares it.
 *   4. The view-tree walker.
 *
 * The widget runs inside the panel's `.cellScaler`, so this component is
 * a pure flex-fill container; the meter palette handles its own layout.
 */
export function DeclarativeWidget({ listing, size, instanceId }: DeclarativeWidgetProps) {
  // Widget-local state — per-instance bag persisted to localStorage.
  // Bound from manifest views as `{local.*}` and mutated via
  // `button.onClick.localUpdate`. Defaults pulled from listing.local
  // (manifest's `local` block; safe if absent).
  const localDefaults = useMemo(() => listing.local ?? undefined, [listing]);
  const [localState, setLocalState] = useWidgetLocalState({
    widgetId: listing.id, instanceId, defaults: localDefaults,
  });
  const settingsBridge = useMemo(() => new WidgetSettingsBridge(listing.id), [listing.id]);
  const [settingsValues, setSettingsValues] = useState<Record<string, unknown>>(() => settingsBridge.get());
  useEffect(() => {
    const unsub = settingsBridge.onChange((v) => setSettingsValues({ ...v }));
    void settingsBridge.load();
    return unsub;
  }, [settingsBridge]);

  // Manifest-declared FontFaces. Loaded once per (widgetId, font name)
  // pair and scoped so two widgets shipping the same font name don't
  // collide. Authors reference their fonts via the meter's `font` prop.
  useEffect(() => {
    void loadWidgetFonts(listing.id, listing.fonts);
  }, [listing.id, JSON.stringify(listing.fonts ?? [])]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tier 2 worker spin-up. Only when the manifest opted in AND a worker
  // source actually appears in `data`.
  const wantsWorker =
    listing.capabilities.code === 'worker' &&
    Object.values(listing.data ?? {}).some((src) => src && src.worker);
  const workerRef = useRef<WidgetWorkerHandle | null>(null);
  // Hydrate from localStorage so a dashboard reload immediately shows the
  // last-known data while the worker fetches fresh values. Without this
  // every reload flashes the empty state for ~1-2 s while the worker
  // boots, fetches, and publishes.
  const [workerPayload, setWorkerPayload] = useState<Record<string, unknown>>(
    () => loadCachedWorkerPayload(listing.id) ?? {},
  );

  useEffect(() => {
    if (!wantsWorker) return;
    const handle = spawnWidgetWorker({
      widgetId: listing.id,
      netFetchAllowlist: listing.capabilities['net.fetch'] ?? [],
      onPublish: (payload) => setWorkerPayload((prev) => {
        const next = { ...prev, ...payload };
        // Persist the merged payload so subsequent reloads hydrate
        // without flashing the empty state.
        saveCachedWorkerPayload(listing.id, next);
        return next;
      }),
      onLog: (level, message, data) => {
        // eslint-disable-next-line no-console
        console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
          `[widget:${listing.id}]`, message, data ?? '',
        );
      },
    });
    workerRef.current = handle;
    return () => {
      handle.dispose();
      workerRef.current = null;
    };
  }, [wantsWorker, listing.id, JSON.stringify(listing.capabilities['net.fetch'] ?? [])]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push settings into the worker whenever they change so authors can
  // react via qos.settings.onChange.
  useEffect(() => {
    workerRef.current?.pushSettings(settingsValues);
  }, [settingsValues]);

  const data = useDataSources({
    widgetId: listing.id,
    sources: listing.data,
    capabilities: { 'net.fetch': listing.capabilities['net.fetch'] ?? [] },
    workerPayload,
    settings: settingsValues,
  });

  const view: WidgetView | undefined = useMemo(() => selectView(listing.view, size), [listing.view, size]);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState({ width: 200, height: 200 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setBoxSize({
        width: Math.max(40, Math.round(rect.width)),
        height: Math.max(40, Math.round(rect.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Universal empty / loading state. Shown when no data source has produced
  // its first value AND there's nothing in the localStorage cache to
  // hydrate from. Subsequent publishes flip us into the regular render path.
  const isEmpty = useMemo(() => detectEmpty(data, listing), [data, listing]);
  const emptyOverride = useMemo(() => detectEmptyOverride(data), [data]);

  return (
    <div ref={wrapRef} className={styles.wrap} style={{ containerType: 'size' }}>
      {emptyOverride ? (
        <WidgetEmptyState
          iconUrl={listing.iconUrl ?? null}
          name={listing.name}
          primary={emptyOverride.primary}
          secondary={emptyOverride.secondary}
          staticIcon={emptyOverride.staticIcon}
        />
      ) : isEmpty ? (
        <WidgetEmptyState
          iconUrl={listing.iconUrl ?? null}
          name={listing.name}
          primary="Loading…"
        />
      ) : (
        renderView(view, {
          data,
          settings: settingsValues,
          size: boxSize,
          widgetId: listing.id,
          local: localState,
          onLocalUpdate: (args, ctx) =>
            setLocalState(resolveLocalUpdateArgs(args, ctx as unknown as Record<string, unknown>)),
        })
      )}
    </div>
  );
}

/**
 * "No data yet" = every declared data source resolves to null/undefined
 * /empty-object. Used to decide whether to show the universal loading
 * state instead of rendering the view tree (which would fill itself with
 * em-dashes and zero-fill bars and look broken).
 */
function detectEmpty(data: Record<string, unknown>, listing: WidgetInstalledListing): boolean {
  const keys = Object.keys(listing.data ?? {});
  if (keys.length === 0) return false;
  for (const key of keys) {
    const v = data[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && v !== null && Object.keys(v as Record<string, unknown>).length === 0) continue;
    return false;
  }
  return true;
}

/**
 * Per-widget empty-state override. Tier 2 widgets can publish a payload
 * shaped `{ <key>: { _emptyState: { primary, secondary } } }` to switch
 * the host into the standard empty-state component with custom copy —
 * useful for soft errors like "Location unknown" that the user should
 * see but shouldn't make the widget look broken.
 */
function detectEmptyOverride(
  data: Record<string, unknown>,
): { primary?: string; secondary?: string; staticIcon?: boolean } | null {
  for (const v of Object.values(data)) {
    if (v && typeof v === 'object' && '_emptyState' in (v as Record<string, unknown>)) {
      const e = (v as { _emptyState?: unknown })._emptyState;
      if (e && typeof e === 'object') {
        return e as { primary?: string; secondary?: string; staticIcon?: boolean };
      }
    }
  }
  return null;
}

function selectView(view: WidgetView | unknown, size: string): WidgetView | undefined {
  if (!view || typeof view !== 'object') return undefined;
  const v = view as Record<string, unknown>;
  // Per-size map shape: keys look like "2x2", "4x2", "4x4". When `type`
  // is also set we treat it as a flat view; otherwise we pick the
  // size-keyed branch with fallback rules.
  if (typeof v.type === 'string') return v as WidgetView;

  // Per-size: try the exact size, then defaults in `default` / "*", then
  // the first size-shaped key.
  const exact = v[size];
  if (exact && typeof exact === 'object') return exact as WidgetView;
  const fallback = v.default ?? v['*'];
  if (fallback && typeof fallback === 'object') return fallback as WidgetView;
  for (const value of Object.values(v)) {
    if (value && typeof value === 'object' && typeof (value as WidgetView).type === 'string') {
      return value as WidgetView;
    }
  }
  return undefined;
}
