import { fetchService, postService } from './service';

/** One configurable-size zone of an OpenRGB device, as the service reports it. */
export interface OpenRgbZone {
  /** The OpenRGB zone index, the value the size write takes. */
  index: number;
  name: string;
  ledCount: number;
  ledsMin: number;
  ledsMax: number;
  /** Sizable with a real range (ledsMin differs from ledsMax). */
  resizable: boolean;
  /** Never sized by the user yet, so the count is a placeholder. */
  needsSize: boolean;
}

export interface OpenRgbZoneDevice {
  deviceId: string;
  name: string;
  zones: OpenRgbZone[];
}

interface ZonesResponse {
  error: boolean;
  msg: string;
  devices: OpenRgbZoneDevice[];
}

export const fetchOpenRgbZones = () => fetchService<ZonesResponse>('/devices/openrgb/zones');

export const setOpenRgbZoneSize = (deviceId: string, zoneIndex: number, ledCount: number) =>
  postService<{ error: boolean; msg: string }>('/devices/openrgb/zones/size', { deviceId, zoneIndex, ledCount });
