import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelDeviceRecord } from '../api/panel';
import { usePanelDevices } from './usePanelDevices';

const api = vi.hoisted(() => ({
  fetchPanelStatus: vi.fn(),
  fetchPanelPhoneSessions: vi.fn(),
  fetchPanelDevices: vi.fn(),
}));
vi.mock('../api/panel', () => api);
vi.mock('../api/corsair', () => ({ getCorsairState: vi.fn().mockResolvedValue(null) }));
vi.mock('./useDevices', () => ({ useDevices: () => ({ devices: [] }) }));
const topics = vi.hoisted(() => new Map<string, () => void>());
vi.mock('./useMultiplexSocket', () => ({
  useMultiplex: () => ({ connected: true }),
  useTopicCallback: (topic: string, _enabled: boolean, cb: () => void) => { topics.set(topic, cb); },
}));

const xeneon = (displayAttached: boolean): PanelDeviceRecord => ({
  id: 'kGR-OBUnm2CE',
  displayName: 'CRX ED00',
  firstSeenAt: 0,
  lastSeenAt: 1,
  displayId: 'CRXED00-5-293b9414-3-UID4353',
  displayAttached,
  capabilities: { surface: 'monitor', family: 'xeneon-edge', touch: true, cssWidth: 2560, cssHeight: 720, dpr: 1, dpi: 183 },
});

describe('usePanelDevices display topology push', () => {
  beforeEach(() => {
    topics.clear();
    api.fetchPanelStatus.mockReset().mockResolvedValue(null);
    api.fetchPanelPhoneSessions.mockReset().mockResolvedValue({ sessions: [] });
    api.fetchPanelDevices.mockReset().mockResolvedValue({ devices: [xeneon(true)] });
  });

  it('drops an unplugged promoted monitor on a displays push, with no panel/device push', async () => {
    const { result } = renderHook(() => usePanelDevices(true));
    await waitFor(() => expect(result.current.devices.map(d => d.id)).toEqual(['display:kGR-OBUnm2CE']));

    api.fetchPanelDevices.mockResolvedValue({ devices: [xeneon(false)] });
    act(() => { topics.get('displays')?.(); });

    await waitFor(() => expect(result.current.devices).toEqual([]));
  });

  it('brings a replugged promoted monitor back on a displays push', async () => {
    api.fetchPanelDevices.mockResolvedValue({ devices: [xeneon(false)] });
    const { result } = renderHook(() => usePanelDevices(true));
    await waitFor(() => expect(api.fetchPanelDevices).toHaveBeenCalled());
    expect(result.current.devices).toEqual([]);

    api.fetchPanelDevices.mockResolvedValue({ devices: [xeneon(true)] });
    act(() => { topics.get('displays')?.(); });

    await waitFor(() => expect(result.current.devices.map(d => d.id)).toEqual(['display:kGR-OBUnm2CE']));
  });
});
