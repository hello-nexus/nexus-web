import { authFetchWithStatus, fetchService } from './service';

export interface Aw3225QfCrosshairConfig {
  type: number;
  color: number;
  maskControl: number;
}

export interface Aw3225QfCrosshairStatus {
  connected: boolean;
  enabled: boolean;
  activeEngine: number;
  displayId: string;
  /** Last Nexus selection; the monitor's adjustment VCP is write-only. */
  config: Aw3225QfCrosshairConfig;
  error: string;
}

const path = '/devices/aw3225qf/crosshair';

export function getAw3225QfCrosshair(): Promise<Aw3225QfCrosshairStatus | null> {
  return fetchService<Aw3225QfCrosshairStatus>(path);
}

export async function setAw3225QfCrosshair(enabled: boolean, config: Aw3225QfCrosshairConfig): Promise<Aw3225QfCrosshairStatus | null> {
  const { response, status } = await authFetchWithStatus(path, { method: 'POST', body: { enabled, ...config } });
  if (!response || (status !== 200 && status !== 422)) return null;
  return response.json() as Promise<Aw3225QfCrosshairStatus>;
}
