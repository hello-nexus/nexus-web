import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FanChannel } from '../../../api/cooling';
import { useCoolingFanChannels } from './useCoolingFanChannels';

const h = vi.hoisted(() => ({ next: vi.fn(), topic: null as null | (() => void) }));
vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: (_t: string, _e: boolean, cb: () => void) => { h.topic = cb; } }));
vi.mock('../../../api/cooling', () => ({ fetchFanChannels: () => h.next() }));

const channel = { id: 'a', seriesId: 's_a' } as FanChannel;

afterEach(() => { vi.useRealTimers(); h.next.mockReset(); });

describe('useCoolingFanChannels', () => {
  it('keeps the last good list when a poll fails and clears it when disabled', async () => {
    vi.useFakeTimers();
    h.next.mockResolvedValueOnce({ channels: [channel] }).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('down'));
    const { result, rerender } = renderHook(({ on }) => useCoolingFanChannels(on), { initialProps: { on: true } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toEqual([channel]);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current).toEqual([channel]);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current).toEqual([channel]);
    rerender({ on: false });
    expect(result.current).toEqual([]);
  });

  it('refetches on the cooling topic, debounced', async () => {
    vi.useFakeTimers();
    const next = { id: 'b', seriesId: 's_b' } as FanChannel;
    h.next.mockResolvedValueOnce({ channels: [channel] }).mockResolvedValue({ channels: [next] });
    const { result } = renderHook(() => useCoolingFanChannels(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toEqual([channel]);
    await act(async () => { h.topic?.(); h.topic?.(); await vi.advanceTimersByTimeAsync(500); });
    expect(h.next).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual([next]);
  });
});
