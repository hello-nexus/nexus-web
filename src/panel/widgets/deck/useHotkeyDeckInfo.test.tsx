import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let deckFrame: (data: unknown) => void = () => {};
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (_t: string, _e: boolean, cb: (d: unknown) => void) => { deckFrame = cb; },
}));
vi.mock('../../../api/deck', () => ({
  getDeckPresets: vi.fn().mockResolvedValue([{ id: 'p1', name: 'One' }]),
  getDeckInstances: vi.fn().mockResolvedValue({ 'streamdeck:S1': { mode: 'custom', activePresetId: 'p1' }, 'widget:w': { mode: 'custom', activePresetId: 'p1' } }),
  getDeckPreset: vi.fn().mockResolvedValue({ id: 'p1', deck: { pages: [] } }),
}));

import * as deckApi from '../../../api/deck';
import { useHotkeyDeckInfo } from './useHotkeyDeckInfo';

const opts = { configs: false, deckSerials: ['S1'] };

beforeEach(() => vi.clearAllMocks());

describe('useHotkeyDeckInfo', () => {
  it('fetches names and instances once for every mounted consumer', async () => {
    const a = renderHook(() => useHotkeyDeckInfo(true, [], opts));
    const b = renderHook(() => useHotkeyDeckInfo(true, [], opts));
    await vi.waitFor(() => expect(a.result.current.presetNames.p1).toBe('One'));
    expect(b.result.current.holders.p1).toEqual({ serials: ['S1'], widgets: 1 });
    expect(a.result.current.serialByPreset.p1).toBe('S1');
    expect(deckApi.getDeckPresets).toHaveBeenCalledTimes(1);
    expect(deckApi.getDeckInstances).toHaveBeenCalledTimes(1);
  });

  it('patches a rename from the frame without refetching, and refetches only on the frame that needs it', async () => {
    const { result } = renderHook(() => useHotkeyDeckInfo(true, [], opts));
    await vi.waitFor(() => expect(result.current.presetNames.p1).toBe('One'));
    vi.mocked(deckApi.getDeckPresets).mockClear();
    vi.mocked(deckApi.getDeckInstances).mockClear();
    act(() => deckFrame({ kind: 'preset', presetId: 'p1', summary: { id: 'p1', name: 'Renamed' } }));
    expect(result.current.presetNames.p1).toBe('Renamed');
    act(() => deckFrame({ kind: 'preset', presetId: 'p1', summary: { id: 'p1', name: 'Renamed' } }));
    expect(deckApi.getDeckPresets).not.toHaveBeenCalled();
    expect(deckApi.getDeckInstances).not.toHaveBeenCalled();
    act(() => deckFrame({ kind: 'active', instanceId: 'streamdeck:S1' }));
    await vi.waitFor(() => expect(deckApi.getDeckInstances).toHaveBeenCalledTimes(1));
  });

  it('drops the device mapping when the deck list empties, without an effect', async () => {
    const { result, rerender } = renderHook(({ serials }) => useHotkeyDeckInfo(true, [], { configs: false, deckSerials: serials }), { initialProps: { serials: ['S1'] } });
    await vi.waitFor(() => expect(result.current.serialByPreset.p1).toBe('S1'));
    rerender({ serials: [] });
    expect(result.current.serialByPreset).toEqual({});
  });
});
