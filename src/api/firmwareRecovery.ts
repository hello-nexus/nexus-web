import { fetchService, postService } from './service';
import type { FirmwareStatusItem } from '../hooks/useFirmwareStatus';

export interface RecoverStartResponse {
  started: boolean;
  error?: boolean;
  msg?: string;
}

/** Recovery rows only (0 or 1): a device stuck in update mode. */
export async function fetchRecoveryRows(): Promise<FirmwareStatusItem[] | null> {
  const rows = await fetchService<FirmwareStatusItem[]>('/devices/firmware/recovery');
  return Array.isArray(rows) ? rows : null;
}

export function recoverFirmware(deviceType: string, version: string): Promise<RecoverStartResponse | null> {
  return postService<RecoverStartResponse>('/devices/firmware/recover', { deviceType, version });
}
