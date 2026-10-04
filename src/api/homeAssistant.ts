import { fetchService, postService } from './service';

export interface HaConfig {
  url: string;
  configured: boolean;
  connected: boolean;
  error?: string;
}

export type HaDomain =
  | 'light' | 'switch' | 'input_boolean' | 'fan' | 'automation'
  | 'scene' | 'script' | 'button' | 'input_button'
  | 'cover' | 'lock'
  | 'sensor' | 'binary_sensor';

export interface HaEntity {
  id: string;
  name: string;
  domain: HaDomain;
  state: string;
  on: boolean;
  reachable: boolean;
  brightnessPct: number;
  supportsBrightness: boolean;
  supportsColor: boolean;
  supportsColorTemp: boolean;
  rgb: [number, number, number] | null;
  colorTempK: number;
  area: string;
  unit: string;
  deviceClass: string;
  // Cover position, -1 when the entity reports none.
  positionPct: number;
  codeRequired: boolean;
  // Hidden in HA or a config/diagnostic entity: HA's own generated views skip it.
  hidden: boolean;
}

export interface HaEntitiesResponse {
  configured: boolean;
  connected: boolean;
  error?: string;
  entities: HaEntity[];
}

export interface HaConfigSetResponse {
  ok: boolean;
  connected: boolean;
  error?: string;
}

export type HaEntitySetResponse = HaEntity;

export type HaEntityAction = 'run' | 'open' | 'close' | 'stop' | 'lock' | 'unlock';

export interface HaDashboard {
  id: string;
  // Empty for HA's default dashboard; the UI supplies the localized name.
  title: string;
}

export interface HaDashboardsResponse {
  connected: boolean;
  error?: string;
  dashboards: HaDashboard[];
}

export type HaDashboardError = '' | 'not_connected' | 'not_found' | 'failed';

export interface HaDashboardResponse {
  id: string;
  error: HaDashboardError;
  // HA's raw Lovelace config, parsed client-side by lovelaceLayout.ts.
  config: unknown;
  // The topic's dashboardsRevision when this config was read.
  revision?: number;
}

// HA's id for its default dashboard.
export const HA_DEFAULT_DASHBOARD_ID = 'lovelace';

export const getHaConfig = () =>
  fetchService<HaConfig>('/home-assistant/config');

export const setHaConfig = (payload: { url: string; token: string }) =>
  postService<HaConfigSetResponse>('/home-assistant/config', payload);

export const fetchHaEntities = () =>
  fetchService<HaEntitiesResponse>('/home-assistant/entities');

export const setHaEntity = (payload: {
  entityId: string;
  on?: boolean;
  brightnessPct?: number;
  rgb?: [number, number, number];
  colorTempK?: number;
  action?: HaEntityAction;
}) =>
  postService<HaEntitySetResponse>('/home-assistant/entity/set', payload);

export const fetchHaDashboards = () =>
  fetchService<HaDashboardsResponse>('/home-assistant/dashboards');

export const fetchHaDashboard = (id: string) =>
  fetchService<HaDashboardResponse>(`/home-assistant/dashboard?id=${encodeURIComponent(id)}`);
