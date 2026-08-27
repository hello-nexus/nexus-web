// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LightingDevice } from '../../../../api/lighting';
import { lightingDeviceNoticeKey } from './lightingDeviceNotices';

const dev = (id: string): LightingDevice => ({ id } as LightingDevice);

describe('lightingDeviceNoticeKey', () => {
  it('returns the 1 Hz notice for every Lian Li zone id', () => {
    for (const id of ['lianli:port0', 'lianli:mirror', 'lianli:port2:inner']) {
      expect(lightingDeviceNoticeKey(dev(id))).toBe('lighting.devices.lianliStreamRate');
    }
  });

  it('returns null for non-Lian Li devices', () => {
    for (const id of ['openrgb-0', 'openrgb-0-1', 'hue:bridge:rid:7', 'np50:abc']) {
      expect(lightingDeviceNoticeKey(dev(id))).toBeNull();
    }
  });
});
