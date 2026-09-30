import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import type { PanelWidget, PanelWidgetSize } from '../../types';

// jsdom has no WebGL2; the tile's contract is only whether it mounts the background.
vi.mock('./MediaLiveBackground', async importOriginal => ({
  ...(await importOriginal<typeof import('./MediaLiveBackground')>()),
  MediaLiveBackground: ({ playing, effect }: { playing: boolean; effect: string }) => (
    <div data-testid="live-bg" data-playing={String(playing)} data-effect={effect} />
  ),
}));

const { MediaWidget } = await import('./MediaWidget');

function renderMedia(size: PanelWidgetSize, config: Record<string, unknown> = {}) {
  const widget: PanelWidget = { id: 'media-1', type: 'media', size, col: 0, row: 0, config };
  return render(
    <PanelPreviewProvider value={true}>
      <MediaWidget widget={widget} surface="y70" />
    </PanelPreviewProvider>,
  );
}

describe('MediaWidget live background', () => {
  it('mounts only when enabled in the widget config', () => {
    const off = renderMedia('4x2');
    expect(screen.queryByTestId('live-bg')).toBeNull();
    off.unmount();

    renderMedia('4x2', { liveBackground: true });
    expect(screen.getByTestId('live-bg').dataset.playing).toBe('true');
  });

  it('plays the visualizer effect, defaulting to lava haze', () => {
    const chosen = renderMedia('2x2', { liveBackground: true, visualizerEffect: 'liquidbeat' });
    expect(screen.getByTestId('live-bg').dataset.effect).toBe('liquidbeat');
    chosen.unmount();

    const unset = renderMedia('2x2', { liveBackground: true });
    expect(screen.getByTestId('live-bg').dataset.effect).toBe('lavahaze');
    unset.unmount();

    renderMedia('2x2', { liveBackground: true, visualizerEffect: 'plasma' });
    expect(screen.getByTestId('live-bg').dataset.effect).toBe('lavahaze');
  });

  it('renders the 4x4 with transport and the volume rail', () => {
    renderMedia('4x4', { liveBackground: true });
    expect(screen.getByLabelText('panel.media.next')).toBeTruthy();
    expect(screen.getByLabelText('panel.media.volume')).toBeTruthy();
    expect(screen.getByTestId('live-bg')).toBeTruthy();
  });
});
