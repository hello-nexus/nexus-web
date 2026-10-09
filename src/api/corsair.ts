import { fetchService, postService } from './service';

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

export interface CorsairHub {
  id: string;
  number: number;
  isConnected: boolean;
  firmware: string;
  redetecting: boolean;
  devices: CorsairDevice[];
}

export interface CorsairState {
  isConnected: boolean;
  firmware: string;
  devices: CorsairDevice[];
  redetecting?: boolean;
  // Absent on an older service; use corsairHubs() to read it.
  hubs?: CorsairHub[];
}

/** The hub list, falling back to one hub built from the top-level fields. */
export function corsairHubs(state: CorsairState): CorsairHub[] {
  if (state.hubs && state.hubs.length > 0) return state.hubs;
  return [{
    id: 'corsair',
    number: 1,
    isConnected: state.isConnected,
    firmware: state.firmware,
    redetecting: state.redetecting === true,
    devices: state.devices,
  }];
}

export function getCorsairState(): Promise<CorsairState | null> {
  return fetchService<CorsairState>('/devices/corsair/state');
}

/** Queues a chain re-scan. True only when the service accepted it (202). */
export async function rescanCorsairHub(hubId: string): Promise<boolean> {
  const res = await postService<{ accepted?: boolean }>('/devices/corsair/rescan', { hubId });
  return res?.accepted === true;
}
