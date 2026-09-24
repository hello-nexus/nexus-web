// The hook takes its state from the "media" topic; GET /api/media is no
// longer polled.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMedia, type MediaSession } from './useMedia';

let topicFrame: Record<string, MediaSession> | null = null;
const useTopic = vi.fn(() => topicFrame);
const fetchService = vi.fn();

vi.mock('../api/service', () => ({
  fetchService: (path: string) => fetchService(path),
  postService: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('./useMultiplexSocket', () => ({
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
});

describe('useMedia', () => {
  it('takes the pushed frame and never fetches', () => {
    topicFrame = { Spotify: session(true) };
    const { result } = renderHook(() => useMedia(true));
    expect(result.current.sessions.Spotify?.playback.playing).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(useTopic).toHaveBeenCalledWith('media', true);
    expect(fetchService).not.toHaveBeenCalled();
  });

  it('reports loading until the first frame lands', () => {
    const { result } = renderHook(() => useMedia(true));
    expect(result.current).toEqual({ sessions: {}, loading: true });
  });

  it('reads an empty frame as no sessions, not loading', () => {
    topicFrame = {};
    const { result } = renderHook(() => useMedia(true));
    expect(result.current).toEqual({ sessions: {}, loading: false });
  });

  it('returns nothing and leaves the topic unsubscribed while disabled', () => {
    topicFrame = { Spotify: session(true) };
    const { result } = renderHook(() => useMedia(false));
    expect(result.current).toEqual({ sessions: {}, loading: false });
    expect(useTopic).toHaveBeenCalledWith('media', false);
  });
});
