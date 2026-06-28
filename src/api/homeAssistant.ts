import { fetchService, postService } from './service';

export interface HaConfig {
  url: string;
  configured: boolean;
  connected: boolean;
  error?: string;
}

export interface HaEntity {
  id: string;
  name: string;
  domain: 'light' | 'switch';
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
}) =>
  postService<HaEntitySetResponse>('/home-assistant/entity/set', payload);
