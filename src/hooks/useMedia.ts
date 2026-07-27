import { useEffect, useRef, useState } from 'react';
import { fetchService, postService } from '../api/service';

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

/**
 * Polls GET /api/media for active media sessions. Returns all sessions keyed
 * by source name (e.g. "Spotify", "Music"). 2s default polling.
 */
export function useMedia(enabled: boolean, pollingRateMs = 2000): MediaState {
  const [state, setState] = useState<MediaState>({ sessions: {}, loading: true });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // When disabled, clear sessions and stop polling.
    if (!enabled) { setState({ sessions: {}, loading: false }); return () => { mounted.current = false; }; }

    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const data = await fetchService<Record<string, MediaSession>>('/api/media');
      if (mounted.current) {
        setState({ sessions: data ?? {}, loading: false });
      }
      timer = setTimeout(tick, pollingRateMs);
    };
    tick();
    return () => { mounted.current = false; clearTimeout(timer); };
  }, [enabled, pollingRateMs]);

  return state;
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
