import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FanChannel } from '../../../api/cooling';
import { useCoolingFanChannels } from './useCoolingFanChannels';

const h = vi.hoisted(() => ({ next: vi.fn() }));
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
});
