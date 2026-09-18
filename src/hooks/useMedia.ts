import { useEffect, useState } from 'react';
import { fetchService, postService } from '../api/service';
import { useMultiplex, useTopic } from './useMultiplexSocket';

export interface MediaSession {
  sourceAppName: string;
  isFocused?: boolean;
  song: { title: string; artist: string; album: string };
  playback: {
    playing: boolean;
    stopped: boolean;
    shuffled?: boolean;
    repeatMode?: string;
    positionMs: number;
    durationMs: number;
  };
  controls: {
    isPlayEnabled: boolean;
    isPauseEnabled: boolean;
    isNextEnabled: boolean;
    isPrevEnabled: boolean;
    isShuffleEnabled?: boolean;
    isRepeatModeEnabled?: boolean;
    isSeekEnabled?: boolean;
  };
}

export interface MediaState {
  sessions: Record<string, MediaSession>;
  loading: boolean;
}

const EMPTY: MediaState = { sessions: {}, loading: false };

/**
 * Active media sessions keyed by source name (e.g. "Spotify", "Music").
 * Subscribes to the multiplexed "media" topic: the service pushes the full
 * session set on change (a play/pause lands within its event latency instead
 * of at the next poll) and a fresh snapshot on subscribe. GET /api/media is
 * polled only while the socket is down, or where no socket context exists.
 */
export function useMedia(enabled: boolean, pollingRateMs = 2000): MediaState {
  const multiplex = useMultiplex();
  const pushLive = !!multiplex?.connected;
  const live = useTopic<Record<string, MediaSession>>('media', enabled && !!multiplex);
  const [polled, setPolled] = useState<MediaState>({ sessions: {}, loading: true });

  const poll = enabled && !pushLive;
  useEffect(() => {
    if (!poll) return;

    // Per-run flag rather than a shared ref: the socket can open while a fetch
    // is in flight, and a ref the next run re-arms would let that fetch
    // reschedule itself alongside the push for the life of the component.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const data = await fetchService<Record<string, MediaSession>>('/api/media');
      if (cancelled) return;
      setPolled({ sessions: data ?? {}, loading: false });
      timer = setTimeout(tick, pollingRateMs);
    };
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [poll, pollingRateMs]);

  if (!enabled) return EMPTY;
  // The pushed frame is the state while the socket is up, and stands in for
  // a poll that has not landed yet after it drops.
  if (live && (pushLive || polled.loading)) return { sessions: live, loading: false };
  return polled;
}

/** Send a playback control command (play, pause, next, previous). */
export async function controlMedia(source: string, action: string): Promise<void> {
  await postService(`/api/media/${encodeURIComponent(source)}/control`, { action });
}

/**
 * Jump to an absolute position. Only meaningful when the session reports
 * controls.isSeekEnabled - the service no-ops for players that cannot seek,
 * so callers must gate the affordance on that flag rather than relying on an
 * error coming back.
 */
export async function seekMedia(source: string, positionMs: number): Promise<void> {
  await postService(`/api/media/${encodeURIComponent(source)}/seek`, {
    positionMs: Math.max(0, Math.round(positionMs)),
  });
}

/**
 * Control the active session: the playing one, falling back to the first.
 * No-op when nothing is playing anywhere.
 */
export async function controlActiveMedia(action: 'playpause' | 'next' | 'previous'): Promise<void> {
  const sessions = await fetchService<Record<string, MediaSession>>('/api/media');
  const entries = Object.entries(sessions ?? {});
  if (entries.length === 0) return;
  const active = entries.find(([, s]) => s.playback?.playing && !s.playback?.stopped) ?? entries[0];
  await controlMedia(active[0], action);
}
