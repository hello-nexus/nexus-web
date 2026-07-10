import { fetchService } from './service';

export interface CorsairDevice {
  channel: number;
  name: string;
  deviceClass: 'Fan' | 'Aio' | 'Pump' | 'CpuBlock' | 'GpuBlock' | 'Case' | 'Adapter' | 'Other';
  ledCount: number;
  hasSpeed: boolean;
  hasTemperature: boolean;
  rpm: number;
  tempC: number | null;
  serial: string;
}

export interface CorsairState {
  isConnected: boolean;
  firmware: string;
  devices: CorsairDevice[];
}

export function getCorsairState(): Promise<CorsairState | null> {
  return fetchService<CorsairState>('/devices/corsair/state');
}
