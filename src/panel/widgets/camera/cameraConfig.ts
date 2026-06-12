// Per-widget capture settings stored in widget.config. Normalization is pure
// so it stays unit-testable: unknown / mistyped values coerce to defaults
// rather than leaking into getUserMedia constraints.

import type { PanelConfigValue } from '../../types';

export type CameraResolution = '720p' | '1080p';
export type CameraCodecSetting = 'auto' | 'h264' | 'mjpeg';

export interface CameraConfig {
  // Empty string = browser default camera.
  deviceId: string;
  resolution: CameraResolution;
  codec: CameraCodecSetting;
}

export const RESOLUTION_DIMS: Record<CameraResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
};

const DEFAULT_RESOLUTION: CameraResolution = '720p';
const CODEC_SETTINGS: ReadonlyArray<CameraCodecSetting> = ['auto', 'h264', 'mjpeg'];

export function readCameraConfig(config?: Record<string, PanelConfigValue>): CameraConfig {
  const deviceId = typeof config?.deviceId === 'string' ? config.deviceId : '';
  const resolution = typeof config?.resolution === 'string' && config.resolution in RESOLUTION_DIMS
    ? config.resolution as CameraResolution
    : DEFAULT_RESOLUTION;
  const codec = typeof config?.codec === 'string' && (CODEC_SETTINGS as readonly string[]).includes(config.codec)
    ? config.codec as CameraCodecSetting
    : 'auto';
  return { deviceId, resolution, codec };
}

/** Stable identity for "did the user-facing capture settings change". */
export function cameraConfigKey(config: CameraConfig): string {
  return `${config.deviceId}|${config.resolution}|${config.codec}`;
}
