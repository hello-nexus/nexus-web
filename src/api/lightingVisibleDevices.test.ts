import { beforeEach, describe, expect, it, vi } from 'vitest';

let rgbRunning: boolean | null = true;
const fetchServiceMock = vi.fn(async (path: string) => {
  if (path === '/lighting/status') return rgbRunning === null ? null : { rgbRunning };
  return {
    isInit: true,
    devices: [
      { id: 'openrgb-s-1', deviceId: 'openrgb-s-1', name: 'M65 PRO' },
      { id: 'mb-0', deviceId: 'port-0', parentDeviceId: 'openrgb-0', name: 'Board' },
      { id: 'keeb', deviceId: 'keeb', name: 'Keeb' },
    ],
  };
});
vi.mock('./service', async importOriginal => ({
  ...(await importOriginal<typeof import('./service')>()),
  fetchService: (path: string) => fetchServiceMock(path),
}));

import { fetchLightingDevices } from './lighting';
import { deriveConflictDevices } from '../hooks/useConflictDevices';

const ids = async () => (await fetchLightingDevices())!.devices.map(d => d.id);

describe('fetchLightingDevices', () => {
  beforeEach(() => { rgbRunning = true; });

  it('keeps snapshot and native cards while OpenRGB runs', async () => {
    expect(await ids()).toEqual(['openrgb-s-1', 'mb-0', 'keeb']);
  });

  it('hides every OpenRGB card, and only those, while it is off', async () => {
    rgbRunning = false;
    expect(await ids()).toEqual(['keeb']);
  });

  it('hides them while the daemon state is unknown', async () => {
    rgbRunning = null;
    expect(await ids()).toEqual(['keeb']);
  });

  it('leaves the conflict list nothing to target while OpenRGB is off', async () => {
    rgbRunning = false;
    const lighting = (await fetchLightingDevices())!.devices.map(d => ({ ...d, conflictAppIds: ['icue'] }));
    const groups = deriveConflictDevices([{ id: 'icue' } as never], [], lighting).get('icue')!;
    expect(groups.some(g => g.lightingIds.some(i => i.startsWith('openrgb-') || i === 'mb-0'))).toBe(false);
  });
});
