import type { PanelWidget } from '../../types';
import type { MediaSession } from '../../../hooks/useMedia';

export interface ActiveMediaSession {
  key: string;
  session: MediaSession;
}

/** The app a session belongs to: Windows names a second session of one app "Firefox 2". */
export function mediaAppName(session: MediaSession): string {
  return session.sourceAppName.replace(/ \d+$/, '');
}

/** The app the widget always shows while it is open, or '' for Auto. */
export function mediaPreferredApp(widget: PanelWidget | undefined): string {
  const value = widget?.config?.preferredApp;
  return typeof value === 'string' ? value : '';
}

function isPlaying(session: MediaSession): boolean {
  return session.playback.playing && !session.playback.stopped;
}

/** The preferred app whenever it has a session, else the playing one, else the one the OS reports as current. */
export function pickActiveSession(
  sessions: Record<string, MediaSession>,
  preferredApp: string,
): ActiveMediaSession | null {
  const entries = Object.entries(sessions);
  if (entries.length === 0) return null;
  const preferred = preferredApp ? entries.filter(([, s]) => mediaAppName(s) === preferredApp) : [];
  const [key, session] = preferred.find(([, s]) => isPlaying(s))
    ?? preferred[0]
    ?? entries.find(([, s]) => isPlaying(s))
    ?? entries.find(([, s]) => s.isFocused)
    ?? entries[0];
  return { key, session };
}
