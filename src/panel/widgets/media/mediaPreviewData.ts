// Catalog preview fixture - fake server payloads, untranslated by design.
// ONE complete full-state snapshot, independent of widget size: the compact
// art+title+controls, the full art card, progress, controls, and the volume
// rail all render from this. Keep in sync with what MediaWidget renders
// (previewMode.test.tsx is the fixture-sync gate). MediaSession has no art
// field and live art comes from a blob fetch preview skips, so the fixture
// carries its own generic cover.
import type { MediaSession } from '../../../hooks/useMedia';
import type { SystemVolumeState } from '../../../hooks/useSystemVolume';
import { previewAlbumArtUri } from '../common/previewAssets';

interface MediaPreviewData {
  active: { key: string; session: MediaSession };
  volume: SystemVolumeState;
  artUrl: string;
}

export const MEDIA_PREVIEW: MediaPreviewData = {
  active: {
    key: 'Spotify',
    session: {
      sourceAppName: 'Spotify',
      song: { title: 'Midnight Drive', artist: 'The Wavelengths', album: 'Neon City' },
      playback: { playing: true, stopped: false, shuffled: false, repeatMode: 'None', positionMs: 83_000, durationMs: 215_000 },
      controls: { isPlayEnabled: true, isPauseEnabled: true, isNextEnabled: true, isPrevEnabled: true, isShuffleEnabled: true, isRepeatModeEnabled: true, isSeekEnabled: true },
    },
  },
  volume: { supported: true, volume: 0.62, muted: false },
  artUrl: previewAlbumArtUri(320),
};
