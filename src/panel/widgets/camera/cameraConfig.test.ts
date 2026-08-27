// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cameraConfigKey, readCameraConfig } from './cameraConfig';

describe('readCameraConfig', () => {
  it('defaults everything when config is absent', () => {
    expect(readCameraConfig(undefined)).toEqual({ deviceId: '', resolution: '720p', codec: 'auto' });
    expect(readCameraConfig({})).toEqual({ deviceId: '', resolution: '720p', codec: 'auto' });
  });

  it('passes valid values through', () => {
    expect(readCameraConfig({ deviceId: 'cam-1', resolution: '1080p', codec: 'mjpeg' }))
      .toEqual({ deviceId: 'cam-1', resolution: '1080p', codec: 'mjpeg' });
    expect(readCameraConfig({ codec: 'h264' }).codec).toBe('h264');
  });

  it('coerces unknown or mistyped values to defaults', () => {
    expect(readCameraConfig({ deviceId: 5, resolution: '4K', codec: 'av1' }))
      .toEqual({ deviceId: '', resolution: '720p', codec: 'auto' });
    expect(readCameraConfig({ resolution: true, codec: null }))
      .toEqual({ deviceId: '', resolution: '720p', codec: 'auto' });
  });
});

describe('cameraConfigKey', () => {
  it('changes with any user-facing capture setting', () => {
    const base = cameraConfigKey({ deviceId: '', resolution: '720p', codec: 'auto' });
    expect(cameraConfigKey({ deviceId: 'x', resolution: '720p', codec: 'auto' })).not.toBe(base);
    expect(cameraConfigKey({ deviceId: '', resolution: '1080p', codec: 'auto' })).not.toBe(base);
    expect(cameraConfigKey({ deviceId: '', resolution: '720p', codec: 'mjpeg' })).not.toBe(base);
    expect(cameraConfigKey({ deviceId: '', resolution: '720p', codec: 'auto' })).toBe(base);
  });
});
