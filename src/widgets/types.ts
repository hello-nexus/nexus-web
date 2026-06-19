// TypeScript shapes mirroring the nexus.app/1 app manifest +
// `/apps-api/installed` listing wire shape. The host runtime in
// nexus-service is the source of truth; see `plans/third-party-app-sdk.md`.
// An app's widget facet renders from the bundle's widget.mjs - there is no
// declarative view tree.

export interface AppManifestAuthor {
  name?: string;
  url?: string;
  email?: string;
}

export interface AppManifestViewport {
  min?: [number, number];
  preferred?: [number, number];
  max?: [number, number];
  aspect?: string;
}

export interface AppManifestCapabilities {
  'sensors.read': string[];
  'rgb.read': boolean;
  'rgb.write': boolean;
  'net.fetch': string[];
  config: boolean;
  /** Opt-in Tier 2. `"worker"` means the bundle ships `worker.js`. */
  code?: string | null;
}

export type AppManifestSettingType =
  | 'sensor'
  | 'rgb-profile'
  | 'color'
  | 'number'
  | 'boolean'
  | 'string'
  | 'select'
  | 'text';

export interface AppManifestSettingEntry {
  key: string;
  type: AppManifestSettingType | string;
  label?: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  filter?: string;
  options?: string[];
  /** Parallel to options, for the `icon-select` control: per-option display
   *  label + icon name (mapped host-side to a lucide glyph). */
  optionLabels?: string[];
  optionIcons?: string[];
}

export interface AppInstalledListing {
  id: string;
  name: string;
  version: string;
  description?: string;
  iconUrl?: string | null;
  surfaces: string[];
  /** Render runtime. Always "sdk": the widget facet loads from widget.mjs. */
  runtime?: string;
  /** True when the bundle ships an expanded page surface (mount({cell,page})).
   *  The dashboard makes the tile click-through into a full section view. */
  page?: boolean;
  capabilities: AppManifestCapabilities;
  viewport?: AppManifestViewport;
  settings?: AppManifestSettingEntry[];
  sizes?: string[];
  defaultSize?: string;
  source: 'dev' | 'user' | 'bundled' | string;
  trusted: boolean;
  /** OEM bake-in: a bundled app to treat as active at first boot (its page
   *  section is auto-pinned), no user "add" required. */
  preinstalled?: boolean;
}

export interface AppInstalledListingResponse {
  apps: AppInstalledListing[];
}

export interface AppCatalogEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  iconUrl?: string | null;
  surfaces: string[];
  capabilities: AppManifestCapabilities;
  source: 'bundled' | 'dev' | 'user' | string;
  installed: boolean;
}

export interface AppCatalogResponse {
  entries: AppCatalogEntry[];
}
