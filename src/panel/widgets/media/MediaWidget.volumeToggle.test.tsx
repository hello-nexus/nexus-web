// The volume slider is on unless the widget's config turns it off, on the
// tile and in the immersive player alike.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MediaSession } from '../../../hooks/useMedia';
import type { PanelWidget } from '../../types';

const session = {
  sourceAppName: 'Spotify',
  song: { title: 'Song', artist: 'Artist', album: 'Album' },
  playback: { playing: true, stopped: false, shuffled: false, repeatMode: 'None', positionMs: 0, durationMs: 100_000 },
  controls: {
    isPlayEnabled: true, isPauseEnabled: true, isNextEnabled: true, isPrevEnabled: true,
    isShuffleEnabled: true, isRepeatModeEnabled: true, isSeekEnabled: true,
  },
} as MediaSession;

const volumeEnabled = vi.fn();
vi.mock('../../../hooks/useMedia', () => ({
  useMedia: () => ({ sessions: { Spotify: session } }),
  controlMedia: vi.fn(),
  seekMedia: vi.fn(),
}));
vi.mock('../../../hooks/useSystemVolume', () => ({
  useSystemVolume: (enabled: boolean) => {
    volumeEnabled(enabled);
    return {
      state: { supported: true, volume: 0.5, muted: false, name: 'Speakers', kind: 'output' },
      previewVolume: vi.fn(), commitVolume: vi.fn(), setMuted: vi.fn(),
    };
  },
}));
vi.mock('../../../api/service', () => ({ fetchServiceBlob: async () => null }));

const { MediaWidget } = await import('./MediaWidget');
const { MediaTouch } = await import('./MediaTouch');

// t() is uninitialised under vitest and returns the raw key.
const VOLUME = 'panel.media.volume';

function widget(config: Record<string, unknown>): PanelWidget {
  return { id: 'm', type: 'media', size: '4x2', col: 0, row: 0, config };
}

describe('media volume slider toggle', () => {
  it('shows the slider on the tile by default', () => {
    render(<MediaWidget widget={widget({})} surface="y70" />);
    expect(screen.getByLabelText(VOLUME)).toBeTruthy();
  });

  it('hides the slider on the tile and stops reading volume when turned off', () => {
    volumeEnabled.mockClear();
    render(<MediaWidget widget={widget({ showVolume: false })} surface="y70" />);
    expect(screen.queryByLabelText(VOLUME)).toBeNull();
    expect(volumeEnabled).not.toHaveBeenCalledWith(true);
  });

  it('labels the slider with its source only when always-show-source is on', () => {
    const off = render(<MediaWidget widget={widget({})} surface="y70" />);
    expect(screen.queryByText('Speakers')).toBeNull();
    off.unmount();

    render(<MediaWidget widget={widget({ showSource: true })} surface="y70" />);
    expect(screen.getByText('Speakers')).toBeTruthy();
  });

  it('hides the slider in the immersive player when turned off', () => {
    const on = render(<MediaTouch widget={widget({})} surface="y70" deviceTouch immersiveGrid={{ columns: 4, rows: 8 }} />);
    expect(screen.getByLabelText(VOLUME)).toBeTruthy();
    on.unmount();

    volumeEnabled.mockClear();
    render(<MediaTouch widget={widget({ showVolume: false })} surface="y70" deviceTouch immersiveGrid={{ columns: 4, rows: 8 }} />);
    expect(screen.queryByLabelText(VOLUME)).toBeNull();
    expect(volumeEnabled).not.toHaveBeenCalledWith(true);
  });
});
