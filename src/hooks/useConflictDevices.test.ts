import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveConflictDevices, useConflictDevices } from './useConflictDevices';
import type { DetectedConflict } from '../api/conflicts';
import type { DeviceListItem } from './useDevices';
import type { LightingDevice } from '../api/lighting';

const icue: DetectedConflict = { id: 'icue', displayName: 'iCUE', category: 'lighting', processName: 'iCUE', pid: 1 };
const lconnect: DetectedConflict = { id: 'lian-li-l-connect', displayName: 'L-Connect', category: 'lighting', processName: 'LConnect', pid: 2 };

function curated(over: Partial<DeviceListItem>): DeviceListItem {
  return { id: 'corsair', name: 'iCUE LINK Hub', category: 'cooler', connected: true, firmwareVersion: '', supportsNexusControl: true, nexusControlEnabled: true, conflictAppId: 'icue', ...over };
}

function card(over: Partial<LightingDevice>): LightingDevice {
  return { id: 'x', name: 'x', ledsOn: true, ledCount: 1, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0, canvasRotation: 0, ...over };
}

describe('deriveConflictDevices', () => {
  it('lists a connected curated device under its mapped app with its control state', () => {
    const byApp = deriveConflictDevices([icue, lconnect], [curated({ nexusControlEnabled: false })], []);

    expect(byApp.get('icue')).toEqual([
      { key: 'device:corsair', name: 'iCUE LINK Hub', owner: 'app', handlerId: 'corsair', lightingIds: [] },
    ]);
    expect(byApp.get('lian-li-l-connect')).toEqual([]);
  });

  it('skips curated devices that are unplugged or have no control switch', () => {
    const byApp = deriveConflictDevices(
      [icue],
      [curated({ connected: false }), curated({ id: 'corsair2', supportsNexusControl: false })],
      [],
    );
    expect(byApp.get('icue')).toEqual([]);
  });

  it('collapses lighting zone cards to one row per owning device, named without the zone suffix', () => {
    const cards = [
      card({ id: 'openrgb-s-MB01-0', deviceId: 'openrgb-s-MB01', name: 'B850I AORUS PRO - D_LED1', controlled: true, conflictAppIds: ['gigabyte-rgb-fusion', 'signalrgb'] }),
      card({ id: 'openrgb-s-MB01-1', deviceId: 'openrgb-s-MB01', name: 'B850I AORUS PRO - D_LED2', controlled: false, conflictAppIds: ['gigabyte-rgb-fusion', 'signalrgb'] }),
      card({ id: 'openrgb-s-RAM1', deviceId: 'openrgb-s-RAM1', name: 'Vengeance RGB', controlled: false, conflictAppIds: ['icue', 'signalrgb'] }),
    ];
    const signal: DetectedConflict = { ...icue, id: 'signalrgb', displayName: 'SignalRGB' };
    const byApp = deriveConflictDevices([icue, signal], [], cards);

    expect(byApp.get('icue')).toEqual([
      { key: 'lighting:openrgb-s-RAM1', name: 'Vengeance RGB', owner: 'app', lightingIds: ['openrgb-s-RAM1'] },
    ]);
    expect(byApp.get('signalrgb')).toEqual([
      { key: 'lighting:openrgb-s-MB01', name: 'B850I AORUS PRO', owner: 'mixed', lightingIds: ['openrgb-s-MB01-0', 'openrgb-s-MB01-1'] },
      { key: 'lighting:openrgb-s-RAM1', name: 'Vengeance RGB', owner: 'app', lightingIds: ['openrgb-s-RAM1'] },
    ]);
  });

  it('folds a hub\'s own lighting cards into the hub row instead of listing them', () => {
    const cards = [
      card({ id: 'corsair:ch1', deviceId: 'corsair-hub', name: 'Channel 1', controlled: true, controlHandlerId: 'corsair' }),
      card({ id: 'corsair:ch2', deviceId: 'corsair-hub', name: 'Channel 2', controlled: false, controlHandlerId: 'corsair' }),
    ];
    const byApp = deriveConflictDevices([icue], [curated({})], cards);

    expect(byApp.get('icue')).toEqual([
      { key: 'device:corsair', name: 'iCUE LINK Hub', owner: 'mixed', handlerId: 'corsair', lightingIds: ['corsair:ch1', 'corsair:ch2'] },
    ]);
  });

  it('reads a hub with its gate off as the app\'s whatever its cards say', () => {
    const cards = [card({ id: 'corsair:ch1', deviceId: 'corsair-hub', name: 'Channel 1', controlled: true, controlHandlerId: 'corsair' })];
    const byApp = deriveConflictDevices([icue], [curated({ nexusControlEnabled: false })], cards);
    expect(byApp.get('icue')?.[0].owner).toBe('app');
  });

  it('treats a card without a controlled flag as Nexus-driven and ignores untagged cards', () => {
    const cards = [
      card({ id: 'a', deviceId: 'a', name: 'Strip', conflictAppIds: ['icue'] }),
      card({ id: 'b', deviceId: 'b', name: 'Old service card' }),
    ];
    expect(deriveConflictDevices([icue], [], cards).get('icue')).toEqual([
      { key: 'lighting:a', name: 'Strip', owner: 'nexus', lightingIds: ['a'] },
    ]);
  });
});

const mockFetchService = vi.fn();
const mockSetDeviceControl = vi.fn();
const mockFetchLightingDevices = vi.fn();
const mockSetLightingDeviceControlled = vi.fn();
const mockSetConflictWhitelisted = vi.fn();

vi.mock('../api/service', () => ({
  fetchService: (...args: unknown[]) => mockFetchService(...args),
}));
vi.mock('../api/devices', () => ({
  setDeviceControl: (...args: unknown[]) => mockSetDeviceControl(...args),
}));
vi.mock('../api/lighting', () => ({
  fetchLightingDevices: (...args: unknown[]) => mockFetchLightingDevices(...args),
  setLightingDeviceControlled: (...args: unknown[]) => mockSetLightingDeviceControlled(...args),
}));
vi.mock('../api/conflicts', () => ({
  setConflictWhitelisted: (...args: unknown[]) => mockSetConflictWhitelisted(...args),
}));

describe('useConflictDevices.setOwner', () => {
  const hubOn = curated({ nexusControlEnabled: true });
  const hubCards = [
    card({ id: 'corsair:ch1', deviceId: 'corsair-hub', name: 'Channel 1', controlled: false, controlHandlerId: 'corsair' }),
  ];
  const ram = card({ id: 'openrgb-s-RAM1', deviceId: 'openrgb-s-RAM1', name: 'Vengeance RGB', controlled: true, conflictAppIds: ['icue'] });

  beforeEach(() => {
    mockFetchService.mockReset().mockResolvedValue([hubOn]);
    mockSetDeviceControl.mockReset().mockResolvedValue([hubOn]);
    mockFetchLightingDevices.mockReset().mockResolvedValue({ isInit: true, devices: [...hubCards, ram] });
    mockSetLightingDeviceControlled.mockReset().mockResolvedValue(null);
    mockSetConflictWhitelisted.mockReset().mockResolvedValue({ error: false, msg: 'Ok' });
  });

  it('handing to Nexus turns the hub gate on and re-controls every card, hub channels included, and clears the whitelist', async () => {
    const { result } = renderHook(() => useConflictDevices([icue], true));
    await waitFor(() => expect(result.current.devicesByApp.get('icue')).toHaveLength(2));

    await act(async () => { await result.current.setOwner('icue', 'nexus'); });

    expect(mockSetDeviceControl).toHaveBeenCalledWith('corsair', true);
    expect(mockSetLightingDeviceControlled.mock.calls.map(c => c[0]).sort()).toEqual(['corsair:ch1', 'openrgb-s-RAM1']);
    expect(mockSetLightingDeviceControlled).toHaveBeenCalledWith('corsair:ch1', true);
    expect(mockSetConflictWhitelisted).toHaveBeenCalledWith('icue', false);
  });

  it('handing to the app turns the hub gate off but leaves its channels alone, and whitelists the app', async () => {
    const { result } = renderHook(() => useConflictDevices([icue], true));
    await waitFor(() => expect(result.current.devicesByApp.get('icue')).toHaveLength(2));

    await act(async () => { await result.current.setOwner('icue', 'app'); });

    expect(mockSetDeviceControl).toHaveBeenCalledWith('corsair', false);
    // Only the OpenRGB card is ignored; the hub's channel is not written.
    expect(mockSetLightingDeviceControlled.mock.calls).toEqual([['openrgb-s-RAM1', false]]);
    expect(mockSetConflictWhitelisted).toHaveBeenCalledWith('icue', true);
  });

  it('reports a whitelist write the service rejected or never answered', async () => {
    const { result } = renderHook(() => useConflictDevices([icue], true));
    await waitFor(() => expect(result.current.devicesByApp.get('icue')).toHaveLength(2));

    mockSetConflictWhitelisted.mockResolvedValueOnce({ error: true, msg: 'unknown conflict id' });
    let recorded = true;
    await act(async () => { recorded = await result.current.setOwner('icue', 'app'); });
    expect(recorded).toBe(false);

    mockSetConflictWhitelisted.mockResolvedValueOnce(null);
    await act(async () => { recorded = await result.current.setOwner('icue', 'nexus'); });
    expect(recorded).toBe(false);
  });

  it('does nothing while disabled', async () => {
    renderHook(() => useConflictDevices([icue], false));
    await act(async () => {});
    expect(mockFetchLightingDevices).not.toHaveBeenCalled();
    expect(mockFetchService).not.toHaveBeenCalled();
  });
});
