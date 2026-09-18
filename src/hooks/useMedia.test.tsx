// The hook takes the "media" topic while the socket is up and polls
// GET /api/media only while it is down (or where no socket context exists).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMedia, type MediaSession } from './useMedia';

const fetchService = vi.fn();
let topicFrame: Record<string, MediaSession> | null = null;
let multiplex: { connected: boolean } | null = null;
const useTopic = vi.fn(() => topicFrame);

vi.mock('../api/service', () => ({
  fetchService: (path: string) => fetchService(path),
  postService: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('./useMultiplexSocket', () => ({
  useMultiplex: () => multiplex,
  useTopic: (topic: string, enabled: boolean) => useTopic(topic, enabled),
}));

const session = (playing: boolean): MediaSession => ({
  sourceAppName: 'Spotify',
  song: { title: 'Song', artist: 'Artist', album: 'Album' },
  playback: { playing, stopped: false, positionMs: 1000, durationMs: 200000 },
  controls: { isPlayEnabled: !playing, isPauseEnabled: playing, isNextEnabled: true, isPrevEnabled: true },
});

beforeEach(() => {
  vi.clearAllMocks();
  topicFrame = null;
  multiplex = null;
  fetchService.mockResolvedValue({ Spotify: session(false) });
});

describe('useMedia', () => {
  it('takes the pushed frame and does not poll while the socket is up', async () => {
    multiplex = { connected: true };
    topicFrame = { Spotify: session(true) };
    const { result } = renderHook(() => useMedia(true));
    await waitFor(() => expect(result.current.sessions.Spotify?.playback.playing).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(useTopic).toHaveBeenCalledWith('media', true);
    expect(fetchService).not.toHaveBeenCalled();
  });

  it('polls while the socket is down', async () => {
    multiplex = { connected: false };
    const { result } = renderHook(() => useMedia(true));
    await waitFor(() => expect(result.current.sessions.Spotify?.playback.playing).toBe(false));
    expect(fetchService).toHaveBeenCalledWith('/api/media');
  });

  it('polls where no socket context exists and leaves the topic unsubscribed', async () => {
    const { result } = renderHook(() => useMedia(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchService).toHaveBeenCalledWith('/api/media');
    expect(useTopic).toHaveBeenCalledWith('media', false);
  });

  it('reports loading until the first frame lands', () => {
    multiplex = { connected: true };
    const { result } = renderHook(() => useMedia(true));
    expect(result.current.loading).toBe(true);
    expect(fetchService).not.toHaveBeenCalled();
  });

  it('stops polling once the socket comes up, even mid-fetch', async () => {
    multiplex = { connected: false };
    let release: (v: unknown) => void = () => {};
    fetchService.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const { result, rerender } = renderHook(() => useMedia(true));
    expect(fetchService).toHaveBeenCalledTimes(1);

    multiplex = { connected: true };
    topicFrame = { Spotify: session(true) };
    rerender();
    release({ Spotify: session(false) });
    await waitFor(() => expect(result.current.sessions.Spotify?.playback.playing).toBe(true));

    await new Promise(r => setTimeout(r, 30));
    expect(fetchService).toHaveBeenCalledTimes(1);
  });

  it('keeps the last pushed frame until the first poll lands after a drop', async () => {
    multiplex = { connected: true };
    topicFrame = { Spotify: session(true) };
    let release: (v: unknown) => void = () => {};
    fetchService.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const { result, rerender } = renderHook(() => useMedia(true));
    expect(result.current.sessions.Spotify?.playback.playing).toBe(true);

    multiplex = { connected: false };
    rerender();
    expect(result.current.sessions.Spotify?.playback.playing).toBe(true);
    expect(fetchService).toHaveBeenCalledWith('/api/media');

    release({ Spotify: session(false) });
    await waitFor(() => expect(result.current.sessions.Spotify?.playback.playing).toBe(false));
  });

  it('returns nothing while disabled', () => {
    multiplex = { connected: true };
    topicFrame = { Spotify: session(true) };
    const { result } = renderHook(() => useMedia(false));
    expect(result.current).toEqual({ sessions: {}, loading: false });
    expect(useTopic).toHaveBeenCalledWith('media', false);
  });
});
