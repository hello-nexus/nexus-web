// The "volume" topic carries two payload shapes: MonitoringBroadcaster pushes
// the full VolumeState, while PanelTopics.BroadcastVolume pushes a valueless
// change ping ({ revision }). Reading the ping as a state is what dropped the
// master fader to zero and greyed it out until the next poll.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSystemVolume } from './useSystemVolume';

const fetchService = vi.fn();
const postService = vi.fn<(path: string, body: unknown) => Promise<null>>(() => Promise.resolve(null));
let topicFrame: unknown = null;

vi.mock('../api/service', () => ({
  fetchService: (path: string) => fetchService(path),
  postService: (path: string, body: unknown) => postService(path, body),
}));

vi.mock('./useMultiplexSocket', () => ({
  useTopic: () => topicFrame,
}));

beforeEach(() => {
  vi.clearAllMocks();
  topicFrame = null;
  fetchService.mockResolvedValue({ supported: true, volume: 0.8, muted: false });
});

describe('useSystemVolume', () => {
  it('takes a full frame as the new state', async () => {
    topicFrame = { supported: true, volume: 0.35, muted: false };
    const { result } = renderHook(() => useSystemVolume(true));
    await waitFor(() => expect(result.current.state.volume).toBe(0.35));
    expect(result.current.state.supported).toBe(true);
  });

  it('refetches on a valueless ping instead of reading it as zero', async () => {
    // Asserting only the settled value would pass with or without the fix: the
    // 1s poll repairs it either way. The bug is the transient, so every render
    // is recorded and the dip is what the assertion looks for.
    const seen: Array<{ volume: number; supported: boolean }> = [];
    const { result, rerender } = renderHook(() => {
      const v = useSystemVolume(true);
      seen.push({ volume: v.state.volume, supported: v.state.supported });
      return v;
    });
    await waitFor(() => expect(result.current.state.volume).toBe(0.8));

    fetchService.mockResolvedValue({ supported: true, volume: 0.5, muted: false });
    const settled = seen.length;
    topicFrame = { revision: 1738000000 };
    rerender();
    await waitFor(() => expect(result.current.state.volume).toBe(0.5));

    const after = seen.slice(settled);
    expect(after.some(s => s.volume === 0)).toBe(false);
    expect(after.some(s => !s.supported)).toBe(false);
  });

  it('holds the local value while a drag is settling', async () => {
    const { result, rerender } = renderHook(() => useSystemVolume(true));
    await waitFor(() => expect(result.current.state.volume).toBe(0.8));

    result.current.previewVolume(0.2);
    await waitFor(() => expect(result.current.state.volume).toBe(0.2));

    topicFrame = { supported: true, volume: 0.9, muted: false };
    rerender();
    expect(result.current.state.volume).toBe(0.2);
  });
});

describe('useSystemVolume with a target', () => {
  const target = { mode: 'auto' as const, source: 'Spotify 2', deviceId: '' };
  const TARGET_PATH = '/system/volume/target?mode=auto&source=Spotify+2&deviceId=';

  beforeEach(() => {
    fetchService.mockImplementation((path: string) => Promise.resolve(path.startsWith('/system/volume/target')
      ? { supported: true, volume: 0.4, muted: false, kind: 'app', id: 'spotify', name: 'Spotify' }
      : { supported: true, volume: 0.8, muted: false }));
  });

  it('reads what the target resolves to', async () => {
    const { result } = renderHook(() => useSystemVolume(true, target));
    await waitFor(() => expect(result.current.state.name).toBe('Spotify'));
    expect(fetchService).toHaveBeenCalledWith(TARGET_PATH);
    expect(result.current.state.volume).toBe(0.4);
    expect(result.current.state.kind).toBe('app');
  });

  it('writes to the resolved target, remembering only the release', async () => {
    const { result } = renderHook(() => useSystemVolume(true, target));
    await waitFor(() => expect(result.current.state.kind).toBe('app'));

    result.current.commitVolume(0.25);
    await waitFor(() => expect(postService).toHaveBeenCalledWith(
      '/system/volume/target', { kind: 'app', id: 'spotify', volume: 0.25, commit: false }));

    result.current.commitVolume(0.3, { flush: true });
    await waitFor(() => expect(postService).toHaveBeenCalledWith(
      '/system/volume/target', { kind: 'app', id: 'spotify', volume: 0.3, commit: true }));
    expect(postService).not.toHaveBeenCalledWith('/system/volume', expect.anything());
  });

  it('mutes the resolved target', async () => {
    const { result } = renderHook(() => useSystemVolume(true, target));
    await waitFor(() => expect(result.current.state.kind).toBe('app'));
    await result.current.setMuted(true);
    expect(postService).toHaveBeenCalledWith('/system/volume/target/mute', { kind: 'app', id: 'spotify', muted: true });
  });

  it('refetches on a full default-output frame instead of taking its level', async () => {
    const { result, rerender } = renderHook(() => useSystemVolume(true, target));
    await waitFor(() => expect(result.current.state.volume).toBe(0.4));
    const reads = fetchService.mock.calls.length;

    topicFrame = { supported: true, volume: 0.9, muted: false };
    rerender();
    await waitFor(() => expect(fetchService.mock.calls.length).toBeGreaterThan(reads));
    expect(result.current.state.volume).toBe(0.4);
  });
});

describe('useSystemVolume across a target change', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('drops a read that outlived its target and keeps one poll loop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let releaseA: (value: unknown) => void = () => {};
    fetchService.mockImplementation((path: string) => path.includes('source=A')
      ? new Promise(resolve => { releaseA = resolve; })
      : Promise.resolve({ supported: true, volume: 0.6, muted: false, kind: 'app', id: 'b', name: 'B' }));
    const { result, rerender } = renderHook(
      ({ source }) => useSystemVolume(true, { mode: 'app', source, deviceId: '' }),
      { initialProps: { source: 'A' } },
    );

    rerender({ source: 'B' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.state.name).toBe('B');

    await act(async () => {
      releaseA({ supported: true, volume: 0.1, muted: false, kind: 'app', id: 'a', name: 'A' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.state.name).toBe('B');

    const before = fetchService.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchService.mock.calls.length - before).toBe(1);
  });
});
