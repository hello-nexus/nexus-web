import { fetchService, postService } from './service';

export interface DisplayCapabilities {
  brightness: boolean;
  contrast: boolean;
  colorTempPresets: string[];
  inputSources: string[];
  volume: boolean;
}

export interface DisplayBrightnessControl {
  supported: boolean;
  min: number;
  max: number;
  current: number | null;
  controlPath: 'unsupported' | 'ddc-ci' | 'windows-internal' | 'linux-backlight' | 'macos-internal' | string;
  writeMode: 'unsupported' | 'immediate' | 'coalesced' | 'commit-only' | string;
  writeCooldownMs: number;
  verifyAfterWrite: boolean;
  unsupportedReason: string;
}

export interface Display {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  isInternal: boolean;
  isDdcCapable: boolean;
  capabilities: DisplayCapabilities;
  brightnessControl: DisplayBrightnessControl;
}

export interface DisplayListResponse {
  displays: Display[];
  hint: string;
}

export interface DisplayBrightnessResponse {
  id: string;
  brightness: number;
  requestedBrightness: number;
  appliedBrightness: number;
  status: 'applied' | 'unsupported' | 'failed' | string;
  error: string;
}

export async function fetchDisplays(): Promise<DisplayListResponse | null> {
  return fetchService<DisplayListResponse>('/displays');
}

export async function fetchDisplayBrightness(id: string): Promise<DisplayBrightnessResponse | null> {
  return fetchService<DisplayBrightnessResponse>(`/displays/${encodeURIComponent(id)}/brightness`);
}

export async function setDisplayBrightness(id: string, brightness: number): Promise<DisplayBrightnessResponse | null> {
  return postService<DisplayBrightnessResponse>(`/displays/${encodeURIComponent(id)}/brightness`, { brightness });
}
