import { fetchService, postService } from '../api/service';
import { useTopic } from './useMultiplexSocket';

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
 * session set on change and a fresh snapshot on subscribe. While the socket
 * is down the last frame stands, as with every other topic-driven widget.
 */
export function useMedia(enabled: boolean): MediaState {
  const live = useTopic<Record<string, MediaSession>>('media', enabled);
  if (!enabled) return EMPTY;
  return live ? { sessions: live, loading: false } : { sessions: {}, loading: true };
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
