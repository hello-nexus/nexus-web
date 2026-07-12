import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeckPresets } from './useDeckPresets';
import {
  fetchDeckPresets, createDeckPreset, updateDeckPreset,
  deleteDeckPreset, activateDeckPreset,
} from '../../../api/streamdeck';

vi.mock('../../../api/streamdeck', () => ({
  fetchDeckPresets: vi.fn(),
  createDeckPreset: vi.fn(),
  updateDeckPreset: vi.fn(),
  deleteDeckPreset: vi.fn(),
  activateDeckPreset: vi.fn(),
}));

const mockFetch = vi.mocked(fetchDeckPresets);
const mockCreate = vi.mocked(createDeckPreset);
const mockUpdate = vi.mocked(updateDeckPreset);
const mockDelete = vi.mocked(deleteDeckPreset);
const mockActivate = vi.mocked(activateDeckPreset);

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  mockFetch.mockResolvedValue({ presets: [], activeId: null });
  mockCreate.mockResolvedValue({ preset: { id: 'p1', name: 'New' }, activeId: 'p1' });
  mockUpdate.mockResolvedValue(true);
  mockDelete.mockResolvedValue({ activeId: null });
  mockActivate.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useDeckPresets', () => {
  it('fetches presets for the given serial on mount and marks available', async () => {
    mockFetch.mockResolvedValue({ presets: [{ id: 'a', name: 'Streaming' }], activeId: 'a' });
    const { result } = renderHook(() => useDeckPresets('SN1'));
    await flush();

    expect(mockFetch).toHaveBeenCalledWith('SN1');
    expect(result.current.available).toBe(true);
    expect(result.current.presets).toEqual([{ id: 'a', name: 'Streaming' }]);
    expect(result.current.activeId).toBe('a');
    expect(result.current.presetCount).toBe(1);
  });

  it('stays unavailable when the GET fails (service build without the routes yet)', async () => {
    mockFetch.mockResolvedValue(null);
    const { result } = renderHook(() => useDeckPresets('SN1'));
    await flush();

    expect(result.current.available).toBe(false);
    expect(result.current.presets).toEqual([]);
  });

  it('does not fetch when serial is null', async () => {
    const { result } = renderHook(() => useDeckPresets(null));
    await flush();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.available).toBe(false);
  });

  it('re-fetches for the new serial when it changes', async () => {
    const { rerender } = renderHook(({ serial }) => useDeckPresets(serial), { initialProps: { serial: 'SN1' } });
    await flush();
    rerender({ serial: 'SN2' });
    await flush();

    expect(mockFetch).toHaveBeenNthCalledWith(1, 'SN1');
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'SN2');
  });

  it('handleCreate creates then reloads the list', async () => {
    mockFetch.mockResolvedValueOnce({ presets: [], activeId: null });
    const { result } = renderHook(() => useDeckPresets('SN1'));
    await flush();

    mockFetch.mockResolvedValueOnce({ presets: [{ id: 'p1', name: 'New' }], activeId: 'p1' });
    let outcome: { error: boolean; msg?: string } | undefined;
    await act(async () => { outcome = await result.current.handleCreate('New'); });

    expect(mockCreate).toHaveBeenCalledWith('SN1', 'New');
    expect(outcome).toEqual({ error: false });
    expect(result.current.presets).toEqual([{ id: 'p1', name: 'New' }]);
  });

  it('handleCreate surfaces an error and does not reload when the service rejects the write (e.g. cap reached)', async () => {
    const { result } = renderHook(() => useDeckPresets('SN1'));
    await flush();
    mockFetch.mockClear();
    mockCreate.mockResolvedValue(null);

    let outcome: { error: boolean; msg?: string } | undefined;
    await act(async () => { outcome = await result.current.handleCreate('Overflow'); });

    expect(outcome).toEqual({ error: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handleRename updates then reloads', async () => {
    const { result } = renderHook(() => useDeckPresets('SN1'));
    await flush();

    await act(async () => { await result.current.handleRename('a', 'Renamed'); });

    expect(mockUpdate).toHaveBeenCalledWith('SN1', 'a', { name: 'Renamed' });
  });

  it('handleDelete deletes then reloads', async () => {
    const { result } = renderHook(() => useDeckPresets('SN1'));
    await flush();

    await act(async () => { await result.current.handleDelete('a'); });

    expect(mockDelete).toHaveBeenCalledWith('SN1', 'a');
  });

  it('handleLoad activates then reloads', async () => {
    const { result } = renderHook(() => useDeckPresets('SN1'));
    await flush();

    await act(async () => { await result.current.handleLoad('a'); });

    expect(mockActivate).toHaveBeenCalledWith('SN1', 'a');
  });
});

describe('useDeckPresets - scheduleAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('debounces into a single saveCurrent PUT once a preset is active', async () => {
    mockFetch.mockResolvedValue({ presets: [{ id: 'a', name: 'Streaming' }], activeId: 'a' });
    const { result } = renderHook(() => useDeckPresets('SN1'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });

    act(() => { result.current.scheduleAutoSave(); });
    act(() => { result.current.scheduleAutoSave(); });
    act(() => { result.current.scheduleAutoSave(); });
    expect(mockUpdate).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('SN1', 'a', { saveCurrent: true });
  });

  it('does not schedule a save when no preset is active', async () => {
    mockFetch.mockResolvedValue({ presets: [], activeId: null });
    const { result } = renderHook(() => useDeckPresets('SN1'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });

    act(() => { result.current.scheduleAutoSave(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not save on unmount when nothing was scheduled', async () => {
    mockFetch.mockResolvedValue({ presets: [{ id: 'a', name: 'Streaming' }], activeId: 'a' });
    const { unmount } = renderHook(() => useDeckPresets('SN1'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('flushes a still-pending save immediately on unmount instead of dropping it', async () => {
    mockFetch.mockResolvedValue({ presets: [{ id: 'a', name: 'Streaming' }], activeId: 'a' });
    const { result, unmount } = renderHook(() => useDeckPresets('SN1'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });

    act(() => { result.current.scheduleAutoSave(); });
    unmount();

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('SN1', 'a', { saveCurrent: true });
  });
});
