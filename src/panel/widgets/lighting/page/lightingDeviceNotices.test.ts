// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LightingDevice } from '../../../../api/lighting';
import { lightingDeviceNoticeKey } from './lightingDeviceNotices';

const dev = (id: string): LightingDevice => ({ id } as LightingDevice);

describe('lightingDeviceNoticeKey', () => {
  it('returns the partial-streaming notice for wireless Lian Li and Kraken zones', () => {
    for (const id of ['lianli-wireless:998D1DE566E1:inner', 'lianli-wireless:64F271E566E1:z0', 'nzxt-kraken:abc']) {
      expect(lightingDeviceNoticeKey(dev(id))).toBe('lighting.devices.partialStreaming');
    }
  });

  it('returns null for controllers that stream every frame', () => {
    for (const id of ['lianli:port0', 'lianli:port2:inner', 'openrgb-0', 'hue:bridge:rid:7', 'np50:abc']) {
      expect(lightingDeviceNoticeKey(dev(id))).toBeNull();
    }
  });
});
