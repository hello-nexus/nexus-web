import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeakerState } from '../../../api/logitechSpeaker';
import { useLogitechSpeaker } from './useLogitechSpeaker';

const api = vi.hoisted(() => ({ fetchSpeaker: vi.fn() }));
vi.mock('../../../api/logitechSpeaker', () => api);

const st = (volume: number): SpeakerState => ({
  present: true, simulated: false, volume, eqEnabled: false, bands: [], bandHz: [], bandMinDb: -20, bandMaxDb: 6,
  presets: [], surroundEnabled: false, room: 'gaming', channels: [], channelGains: [], channelMaxGain: 2,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('useLogitechSpeaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.fetchSpeaker.mockResolvedValue(st(0.1));
  });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  const mount = async () => {
    const hook = renderHook(() => useLogitechSpeaker());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    return hook;
  };

  it('keeps the newest write when replies arrive out of order', async () => {
    const { result } = await mount();
    const first = deferred<SpeakerState>();
    const second = deferred<SpeakerState>();
    let a!: Promise<boolean>;
    let b!: Promise<boolean>;
    act(() => {
      a = result.current.change(() => first.promise);
      b = result.current.change(() => second.promise);
    });
    await act(async () => { second.resolve(st(0.8)); await b; });
    expect(result.current.state?.volume).toBe(0.8);
    await act(async () => { first.resolve(st(0.3)); await a; });
    expect(result.current.state?.volume).toBe(0.8);
  });

  it('drops a poll that began before a write started', async () => {
    const { result } = await mount();
    const poll = deferred<SpeakerState>();
    api.fetchSpeaker.mockReturnValueOnce(poll.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await act(async () => { await result.current.change(async () => st(0.9)); });
    await act(async () => { poll.resolve(st(0.2)); await Promise.resolve(); });
    expect(result.current.state?.volume).toBe(0.9);
  });

  it('shows a failure until the next good reply, and clears it after a while', async () => {
    const { result } = await mount();
    await act(async () => { await result.current.change(async () => null); });
    expect(result.current.failure).toBe('devices.logitechSpeaker.failed');
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(result.current.failure).toBeNull();
    act(() => result.current.report('x.key'));
    expect(result.current.failure).toBe('x.key');
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(result.current.failure).toBeNull();
  });
});
