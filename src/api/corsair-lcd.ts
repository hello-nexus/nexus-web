import { fetchService, putService } from './service';

/** Live state of the iCUE LINK cooler's LCD module. */
export interface CorsairLcdState {
  hasDevice: boolean;
  selectedMediaId: string | null;
  brightness: number;
  rotation: number;
}

export interface CorsairLcdPatch {
  brightness?: number;
  rotation?: number;
  mediaId?: string;
}

export function getCorsairLcdState(): Promise<CorsairLcdState | null> {
  return fetchService<CorsairLcdState>('/devices/corsair/lcd/state');
}

export function setCorsairLcd(patch: CorsairLcdPatch): Promise<unknown | null> {
  return putService('/devices/corsair/lcd/settings', patch);
}
