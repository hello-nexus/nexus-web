// A second consumer mounting mid-track is seeded from the cached frame, whose
// position is only as fresh as the last changed frame. The hook must age it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMedia, type MediaSession } from './useMedia';

let topicFrame: Record<string, MediaSession> | null = null;
let frameAgeMs = 0;

vi.mock('../api/service', () => ({
  fetchService: vi.fn(),
  postService: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('./useMultiplexSocket', () => ({
  useTopic: () => topicFrame,
  topicFrameAgeMs: () => frameAgeMs,
}));

const session = (over: Partial<MediaSession['playback']>): MediaSession => ({
  sourceAppName: 'Spotify',
  song: { title: 'Song', artist: 'Artist', album: 'Album' },
  playback: { playing: true, stopped: false, positionMs: 100000, durationMs: 200000, ...over },
  controls: { isPlayEnabled: false, isPauseEnabled: true, isNextEnabled: true, isPrevEnabled: true },
});

beforeEach(() => {
  topicFrame = null;
  frameAgeMs = 0;
});

describe('useMedia cached frame age', () => {
  it('advances a playing session by the age of the frame', () => {
    topicFrame = { Spotify: session({}) };
    frameAgeMs = 30000;
    const { result } = renderHook(() => useMedia(true));
    expect(result.current.sessions.Spotify.playback.positionMs).toBe(130000);
  });

  it('leaves a fresh frame untouched', () => {
    topicFrame = { Spotify: session({}) };
    const { result } = renderHook(() => useMedia(true));
    expect(result.current.sessions.Spotify.playback.positionMs).toBe(100000);
  });

  it('does not advance a paused session', () => {
    topicFrame = { Spotify: session({ playing: false }) };
    frameAgeMs = 30000;
    const { result } = renderHook(() => useMedia(true));
    expect(result.current.sessions.Spotify.playback.positionMs).toBe(100000);
  });

  it('clamps to the track duration', () => {
    topicFrame = { Spotify: session({ positionMs: 190000 }) };
    frameAgeMs = 30000;
    const { result } = renderHook(() => useMedia(true));
    expect(result.current.sessions.Spotify.playback.positionMs).toBe(200000);
  });
});
