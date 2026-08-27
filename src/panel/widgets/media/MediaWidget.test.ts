// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mediaArtSignature } from './mediaArt';
import type { MediaSession } from '../../../hooks/useMedia';

function session(song: Partial<MediaSession['song']>): MediaSession {
  return {
    sourceAppName: 'Spotify',
    song: {
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      ...song,
    },
    playback: {
      playing: true,
      stopped: false,
      positionMs: 0,
      durationMs: 1000,
    },
    controls: {
      isPlayEnabled: true,
      isPauseEnabled: true,
      isNextEnabled: true,
      isPrevEnabled: true,
    },
  };
}

describe('mediaArtSignature', () => {
  it('changes when title, artist, or album changes', () => {
    const original = mediaArtSignature(session({}));

    expect(mediaArtSignature(session({ title: 'Next Song' }))).not.toBe(original);
    expect(mediaArtSignature(session({ artist: 'Next Artist' }))).not.toBe(original);
    expect(mediaArtSignature(session({ album: 'Next Album' }))).not.toBe(original);
  });

  it('keeps missing song fields stable', () => {
    expect(mediaArtSignature(undefined)).toBe(mediaArtSignature(null));
    expect(mediaArtSignature(session({ title: '', artist: '', album: '' }))).toBe('\u001f\u001f');
  });
});
