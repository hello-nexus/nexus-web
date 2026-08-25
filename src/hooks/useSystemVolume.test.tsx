// The "volume" topic carries two payload shapes: MonitoringBroadcaster pushes
// the full VolumeState, while PanelTopics.BroadcastVolume pushes a valueless
// change ping ({ revision }). Reading the ping as a state is what dropped the
// master fader to zero and greyed it out until the next poll.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSystemVolume } from './useSystemVolume';

const fetchService = vi.fn();
let topicFrame: unknown = null;

vi.mock('../api/service', () => ({
  fetchService: (path: string) => fetchService(path),
  postService: vi.fn(() => Promise.resolve(null)),
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
