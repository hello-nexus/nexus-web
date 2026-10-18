import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hiddenCardIds } from '../lib/lightingVisibility';

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

// The last known daemon state lives in the module, so each test starts from a fresh one.
async function load() {
  vi.resetModules();
  const lighting = await import('./lighting');
  const conflicts = await import('../hooks/useConflictDevices');
  return { fetchLightingDevices: lighting.fetchLightingDevices, deriveConflictDevices: conflicts.deriveConflictDevices };
}

describe('fetchLightingDevices', () => {
  beforeEach(() => { rgbRunning = true; });

  it('keeps snapshot and native cards while OpenRGB runs', async () => {
    const { fetchLightingDevices } = await load();
    expect((await fetchLightingDevices())!.devices.map(d => d.id)).toEqual(['openrgb-s-1', 'mb-0', 'keeb']);
  });

  it('hides every OpenRGB card, and only those, while it is off, and still reports them', async () => {
    rgbRunning = false;
    const { fetchLightingDevices } = await load();
    const res = (await fetchLightingDevices())!;
    expect(res.devices.map(d => d.id)).toEqual(['keeb']);
    expect(res.allDevices).toHaveLength(3);
    expect(res.rgbRunning).toBe(false);
  });

  it('hides them while the daemon state has never been read', async () => {
    rgbRunning = null;
    const { fetchLightingDevices } = await load();
    expect((await fetchLightingDevices())!.devices.map(d => d.id)).toEqual(['keeb']);
  });

  it('keeps the last known state when a status read fails', async () => {
    const { fetchLightingDevices } = await load();
    await fetchLightingDevices();
    rgbRunning = null;
    expect((await fetchLightingDevices())!.devices.map(d => d.id)).toEqual(['openrgb-s-1', 'mb-0', 'keeb']);
  });

  it('leaves the conflict list nothing to target while OpenRGB is off', async () => {
    rgbRunning = false;
    const { fetchLightingDevices, deriveConflictDevices } = await load();
    const lighting = (await fetchLightingDevices())!.devices.map(d => ({ ...d, conflictAppIds: ['icue'] }));
    const groups = deriveConflictDevices([{ id: 'icue' } as never], [], lighting).get('icue')!;
    expect(groups.some(g => g.lightingIds.some(i => i.startsWith('openrgb-') || i === 'mb-0'))).toBe(false);
  });
});

describe('hiddenCardIds', () => {
  it('names ids the service lists but the response hides, so a selection prune can keep them', () => {
    const res = { devices: [{ id: 'keeb' }], allDevices: [{ id: 'keeb' }, { id: 'openrgb-s-1' }] };
    expect([...hiddenCardIds(res)]).toEqual(['openrgb-s-1']);
    expect([...hiddenCardIds({ devices: [{ id: 'keeb' }] })]).toEqual([]);
  });
});
