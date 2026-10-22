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

  it('takes the preset list from a presets frame without a GET', async () => {
    const { result } = renderHook(() => useHotkeyDeckInfo(true, [], opts));
    await vi.waitFor(() => expect(result.current.presetNames.p1).toBe('One'));
    vi.mocked(deckApi.getDeckPresets).mockClear();
    act(() => deckFrame({ kind: 'presets', presets: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] }));
    expect(result.current.presetNames).toEqual({ p1: 'A', p2: 'B' });
    expect(deckApi.getDeckPresets).not.toHaveBeenCalled();
  });

  it('reads instances once more when an active frame arrives during a GET', async () => {
    let release: (v: Record<string, unknown>) => void = () => {};
    vi.mocked(deckApi.getDeckInstances).mockReset();
    vi.mocked(deckApi.getDeckInstances).mockImplementationOnce(() => new Promise(r => { release = r as typeof release; }));
    vi.mocked(deckApi.getDeckInstances).mockResolvedValue({ 'streamdeck:S1': { mode: 'custom', activePresetId: 'p2' } } as never);
    const { result } = renderHook(() => useHotkeyDeckInfo(true, [], opts));
    act(() => deckFrame({ kind: 'active', instanceId: 'streamdeck:S1' }));
    await act(async () => { release({ 'streamdeck:S1': { mode: 'custom', activePresetId: 'p1' } }); });
    await vi.waitFor(() => expect(result.current.serialByPreset.p2).toBe('S1'));
    expect(deckApi.getDeckInstances).toHaveBeenCalledTimes(2);
  });

  it('applies a preset frame that arrived while that config was still loading', async () => {
    let release: (v: unknown) => void = () => {};
    vi.mocked(deckApi.getDeckPreset).mockImplementationOnce(() => new Promise(r => { release = r; }));
    const binding = { id: 'b', combo: null, enabled: true, status: 'active', target: { kind: 'deck', presetId: 'p1', tag: 'b' } } as never;
    const { result } = renderHook(() => useHotkeyDeckInfo(true, [binding], { configs: true, deckSerials: [] }));
    await vi.waitFor(() => expect(deckApi.getDeckPreset).toHaveBeenCalled());
    const newer = { pages: [{ slots: [{ hotkeyTag: 'b' }] }] };
    act(() => deckFrame({ kind: 'preset', presetId: 'p1', summary: { id: 'p1', name: 'One' }, deck: newer }));
    await act(async () => { release({ id: 'p1', deck: { pages: [] } }); });
    await vi.waitFor(() => expect(result.current.configs.p1).toEqual(newer));
  });

  it('clears the maps of a mounted but disabled consumer when the last enabled one leaves', async () => {
    const active = renderHook(() => useHotkeyDeckInfo(true, [], opts));
    const idle = renderHook(() => useHotkeyDeckInfo(false, [], opts));
    await vi.waitFor(() => expect(idle.result.current.presetNames.p1).toBe('One'));
    active.unmount();
    expect(idle.result.current.presetNames).toEqual({});
  });
});
