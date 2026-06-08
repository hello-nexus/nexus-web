// TypeScript shapes mirroring the nexus.widget/2 declarative manifest +
// `/widgets-api/installed` listing wire shape. The host runtime in
// nexus-service is the source of truth; see `plans/widget-sdk.md`.

export interface WidgetManifestAuthor {
  name?: string;
  url?: string;
  email?: string;
}

export interface WidgetManifestViewport {
  min?: [number, number];
  preferred?: [number, number];
  max?: [number, number];
  aspect?: string;
}

export interface WidgetManifestCapabilities {
  'sensors.read': string[];
  'rgb.read': boolean;
  'rgb.write': boolean;
  'net.fetch': string[];
  config: boolean;
  /** Opt-in Tier 2. `"worker"` means the bundle ships `worker.js`. */
  code?: string | null;
}

export type WidgetManifestSettingType =
  | 'sensor'
  | 'rgb-profile'
  | 'color'
  | 'number'
  | 'boolean'
  | 'string'
  | 'select'
  | 'text';

export interface WidgetManifestSettingEntry {
  key: string;
  type: WidgetManifestSettingType | string;
  label?: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  filter?: string;
  options?: string[];
}

export interface WidgetManifestDataSource {
  /** Local sensor binding (e.g. `cpu.package.temperature`). */
  sensor?: string;
  /** HTTPS endpoint to fetch via the host-mediated proxy. */
  fetch?: string;
  /** Refresh cadence (e.g. `10m`, `30s`). Minimum 30 s enforced. */
  refresh?: string;
  /** Optional headers forwarded by the proxy. */
  headers?: Record<string, string>;
  /** JSONPath extractors: target-key → JSONPath expression. */
  extract?: Record<string, string>;
  /** Tier 2 publish-payload key the worker exposes to the renderer. */
  worker?: string;
  /**
   * Host-provided ticking clock. The renderer ticks at `tickEvery` and
   * exposes a `data.<key>` object with formatted parts:
   *   { iso, hour, hour12, minute, second, ampm, weekday, day, month,
   *     year, time, date, hourAngle, minuteAngle, secondAngle }
   * `tickEvery` accepts any parseCadence duration (`100ms`, `500ms`, `1s`,
   * `1m`), floored at 100 ms.
   * `timezone` is an IANA zone (e.g. "America/New_York") or empty for
   * the system zone. May be a `{settings.x}` binding.
   */
  clock?: {
    tickEvery?: string;
    timezone?: string;
    hour12?: boolean;
  };
  /**
   * Host-action data source. The renderer POSTs to /widgets-api/dispatch
   * with the named action on a schedule (`refresh`, default 5s) and
   * surfaces the response body as the data value. The action must be in
   * the manifest's `capabilities.dispatch` allowlist.
   */
  host?: {
    action: string;
    refresh?: string;
    args?: Record<string, unknown>;
  };
}

/** A view-tree node, kept loose so the renderer's switch on `type` is the
 *  only place that knows the meter palette. */
export interface WidgetView {
  type: string;
  [k: string]: unknown;
}

/**
 * Bundled font face. The host loads the asset via the FontFace API and
 * scopes the family name to the widget id, so two widgets shipping fonts
 * named "led" don't collide.
 */
export interface WidgetManifestFont {
  /** Author-chosen name. Referenced from view bindings via `fontFamily`. */
  name: string;
  /** Bundle-relative path (woff2 / ttf). */
  src: string;
  weight?: number | string;
  style?: 'normal' | 'italic';
}

export interface WidgetInstalledListing {
  id: string;
  name: string;
  version: string;
  description?: string;
  iconUrl?: string | null;
  surfaces: string[];
  /** Render runtime: undefined/"declarative" = meter-palette view tree; "sdk" =
   *  sandboxed remote-component widget loaded from the bundle's widget.mjs. */
  runtime?: string;
  /** True when the SDK bundle ships an expanded page surface (mount({cell,page})).
   *  The dashboard makes the tile click-through into a full section view. */
  page?: boolean;
  capabilities: WidgetManifestCapabilities;
  viewport?: WidgetManifestViewport;
  settings?: WidgetManifestSettingEntry[];
  sizes?: string[];
  defaultSize?: string;
  view?: WidgetView;
  data?: Record<string, WidgetManifestDataSource>;
  fonts?: WidgetManifestFont[];
  /** Default values for the widget's per-instance local-state bag.
   *  Bound via `{local.*}`; mutated by `button.onClick.localUpdate`. */
  local?: Record<string, unknown>;
  source: 'dev' | 'user' | 'bundled' | string;
  trusted: boolean;
}

export interface WidgetInstalledListingResponse {
  widgets: WidgetInstalledListing[];
}

export interface WidgetCatalogEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  iconUrl?: string | null;
  surfaces: string[];
  capabilities: WidgetManifestCapabilities;
  source: 'bundled' | 'dev' | 'user' | string;
  installed: boolean;
}

export interface WidgetCatalogResponse {
  entries: WidgetCatalogEntry[];
}
