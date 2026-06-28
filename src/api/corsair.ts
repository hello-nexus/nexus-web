import { fetchService, putService } from './service';

export interface CorsairDevice {
  channel: number;
  name: string;
  deviceClass: 'Fan' | 'Aio' | 'Pump' | 'CpuBlock' | 'GpuBlock' | 'Case' | 'Adapter' | 'Other';
  ledCount: number;
  hasSpeed: boolean;
  hasTemperature: boolean;
  rpm: number;
  tempC: number | null;
}

export interface CorsairState {
  isConnected: boolean;
  firmware: string;
  stopConflictingApps: boolean;
  devices: CorsairDevice[];
}

export function getCorsairState(): Promise<CorsairState | null> {
  return fetchService<CorsairState>('/devices/corsair/state');
}

export function setCorsairSettings(settings: { stopConflictingApps: boolean }): Promise<unknown | null> {
  return putService('/devices/corsair/settings', settings);
}
