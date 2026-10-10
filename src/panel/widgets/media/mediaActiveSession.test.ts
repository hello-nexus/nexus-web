// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mediaAppName, mediaPreferredApp, pickActiveSession } from './mediaActiveSession';
import type { MediaSession } from '../../../hooks/useMedia';
import type { PanelWidget } from '../../types';

function session(sourceAppName: string, playing: boolean, isFocused = false): MediaSession {
  return {
    sourceAppName,
    isFocused,
    song: { title: 'Song', artist: 'Artist', album: '' },
    playback: { playing, stopped: false, positionMs: 0, durationMs: 1000 },
    controls: { isPlayEnabled: true, isPauseEnabled: true, isNextEnabled: true, isPrevEnabled: true },
  };
}

describe('pickActiveSession', () => {
  it('returns null with no sessions', () => {
    expect(pickActiveSession({}, 'Spotify')).toBeNull();
  });

  it('shows the playing session on Auto', () => {
    const picked = pickActiveSession({ Firefox: session('Firefox', false), Spotify: session('Spotify', true) }, '');
    expect(picked?.key).toBe('Spotify');
  });

  it('falls back to the focused session when nothing plays', () => {
    const picked = pickActiveSession({ Firefox: session('Firefox', false), Spotify: session('Spotify', false, true) }, '');
    expect(picked?.key).toBe('Spotify');
  });

  it('keeps a paused preferred app over a playing one', () => {
    const picked = pickActiveSession({ Firefox: session('Firefox', true, true), Spotify: session('Spotify', false) }, 'Spotify');
    expect(picked?.key).toBe('Spotify');
  });

  it('prefers the playing session among two of the preferred app', () => {
    const picked = pickActiveSession(
      { Firefox: session('Firefox', false), 'Firefox 2': session('Firefox 2', true), Spotify: session('Spotify', true) },
      'Firefox',
    );
    expect(picked?.key).toBe('Firefox 2');
  });

  it('falls back to Auto when the preferred app is closed', () => {
    const picked = pickActiveSession({ Firefox: session('Firefox', false), Edge: session('Edge', true) }, 'Spotify');
    expect(picked?.key).toBe('Edge');
  });

  it('matches on the app name when the key is a Linux bus name', () => {
    const picked = pickActiveSession({
      'org.mpris.MediaPlayer2.firefox.instance_123': session('Firefox', true),
      'org.mpris.MediaPlayer2.spotify': session('Spotify', false),
    }, 'Spotify');
    expect(picked?.key).toBe('org.mpris.MediaPlayer2.spotify');
  });
});

describe('mediaAppName', () => {
  it('strips the service dedupe suffix', () => {
    expect(mediaAppName(session('Firefox 2', true))).toBe('Firefox');
    expect(mediaAppName(session('Spotify', true))).toBe('Spotify');
  });
});

describe('mediaPreferredApp', () => {
  it('reads a string config value and defaults to Auto', () => {
    const widget = (config?: Record<string, unknown>) => ({ config }) as PanelWidget;
    expect(mediaPreferredApp(widget({ preferredApp: 'Spotify' }))).toBe('Spotify');
    expect(mediaPreferredApp(widget({ preferredApp: 3 }))).toBe('');
    expect(mediaPreferredApp(undefined)).toBe('');
  });
});
