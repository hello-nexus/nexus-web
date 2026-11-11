import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DDC_PROBE_PATIENT, useDdcBrightness } from './useDdcBrightness';

const api = vi.hoisted(() => ({ fetchDisplays: vi.fn() }));
vi.mock('../api/displays', () => api);
vi.mock('./useMultiplexSocket', () => ({ useTopicCallback: () => {} }));

const unsupported = { displays: [{ id: 'd1', brightnessControl: { supported: false, current: null } }] };

describe('useDdcBrightness probe schedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.fetchDisplays.mockReset().mockResolvedValue(unsupported);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('probes at the caller interval and gives up at its deadline', async () => {
    renderHook(() => useDdcBrightness('d1', { intervalMs: 1000, timeoutMs: 3500 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    // The first read, then one per interval until the deadline passes (read at 4 s sees it past 3.5 s and stops).
    expect(api.fetchDisplays).toHaveBeenCalledTimes(5);
  });

  it('defaults to the patient device page schedule', async () => {
    renderHook(() => useDdcBrightness('d1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(DDC_PROBE_PATIENT.intervalMs * 3); });
    expect(api.fetchDisplays).toHaveBeenCalledTimes(4);
  });

  it('reports the value once the display answers', async () => {
    const { result } = renderHook(() => useDdcBrightness('d1', { intervalMs: 1000, timeoutMs: 5000 }));
    await act(async () => { await Promise.resolve(); });
    api.fetchDisplays.mockResolvedValue({ displays: [{ id: 'd1', brightnessControl: { supported: true, current: 62 } }] });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.value).toBe(62);
  });
});
