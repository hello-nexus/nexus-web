import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightingDevice } from '../api/lighting';

const fetchMock = vi.fn();
const writeMock = vi.fn();
vi.mock('../api/lighting', () => ({
  fetchLightingDevices: (...a: unknown[]) => fetchMock(...a),
  setLightingDeviceControlled: (...a: unknown[]) => writeMock(...a),
}));

import { useOpenRgbDevices } from './useOpenRgbDevices';

const card = (id: string, controlled: boolean): LightingDevice => ({ id, deviceId: id, name: id, controlled, ledsOn: true, ledCount: 1 }) as LightingDevice;
const list = (controlled: boolean) => ({ isInit: true, devices: [card('openrgb-1', controlled), card('openrgb-2', controlled)], rgbRunning: true });
const controlledOf = (r: { current: { cards: LightingDevice[] } }) => r.current.cards.map(c => c.controlled);

describe('useOpenRgbDevices.setControlled', () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(list(true));
    writeMock.mockReset().mockResolvedValue({});
  });

  it('does not let a poll that started before the click flip the switch back', async () => {
    const { result } = renderHook(() => useOpenRgbDevices(true));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let answerStale!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise(r => { answerStale = r; }));
    act(() => { void result.current.refresh(); });
    fetchMock.mockResolvedValue(list(false));
    await act(async () => { await result.current.setControlled(['openrgb-1', 'openrgb-2'], false); });

    await act(async () => { answerStale(list(true)); });
    expect(controlledOf(result)).toEqual([false, false]);
  });

  it('reverts the cards whose write failed once the refetch lands', async () => {
    const { result } = renderHook(() => useOpenRgbDevices(true));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    writeMock.mockImplementation((id: string) => (id === 'openrgb-2' ? Promise.reject(new Error('x')) : Promise.resolve({})));
    fetchMock.mockResolvedValue({ ...list(true), devices: [card('openrgb-1', false), card('openrgb-2', true)] });

    await act(async () => { await result.current.setControlled(['openrgb-1', 'openrgb-2'], false); });

    expect(controlledOf(result)).toEqual([false, true]);
  });
});
