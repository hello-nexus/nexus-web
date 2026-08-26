// The visualizer takes over the immersive frame: the transport fades out on an
// idle timer and a tap brings it back, so the tap that reveals must NOT also
// cycle the effect - otherwise reaching for pause changes the visualizer.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import type { MediaSession } from '../../../hooks/useMedia';

const session: MediaSession = {
  sourceAppName: 'Spotify',
  song: { title: 'Forever?', artist: 'Chokomignon', album: 'Forever?' },
  playback: { playing: true, stopped: false, shuffled: false, repeatMode: 'None', positionMs: 20_000, durationMs: 100_000 },
  controls: {
    isPlayEnabled: true, isPauseEnabled: true, isNextEnabled: true, isPrevEnabled: true,
    isShuffleEnabled: true, isRepeatModeEnabled: true, isSeekEnabled: true,
  },
} as MediaSession;

vi.mock('../../../hooks/useMedia', () => ({
  useMedia: () => ({ sessions: { Spotify: session } }),
  controlMedia: vi.fn(),
  seekMedia: vi.fn(),
}));
vi.mock('../../../hooks/useSystemVolume', () => ({
  useSystemVolume: () => ({
    state: { supported: false, volume: 0, muted: false },
    previewVolume: vi.fn(), commitVolume: vi.fn(), setMuted: vi.fn(),
  }),
}));
vi.mock('../../../api/service', () => ({ fetchServiceBlob: async () => null }));
// The renderer needs a WebGL2 context jsdom does not provide; the visualizer's
// own contract (which effect it is handed) is asserted through this stub.
vi.mock('./MediaVisualizer', () => ({
  MediaVisualizer: ({ effect }: { effect: string }) => <div data-testid="visualizer" data-effect={effect} />,
}));

const { MediaTouch } = await import('./MediaTouch');
const { DEFAULT_MEDIA_VISUALIZER, nextVisualizerEffect } = await import('./mediaVisualizers');

const SHOW = 'panel.media.visualizer.show';
const HIDE = 'panel.media.visualizer.hide';
const NEXT = 'panel.media.visualizer.next';
const REVEAL = 'panel.media.visualizer.showControls';

function renderTouch(config: Record<string, unknown> = {}, onUpdate?: (c: Record<string, unknown>) => void) {
  const widget = { id: 'm', type: 'media', size: '4x4', col: 0, row: 0, config };
  return render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <MediaTouch widget={widget as any} surface="y70" deviceTouch immersiveGrid={{ columns: 4, rows: 8 }} onUpdate={onUpdate as any} />,
  );
}

const fadeGroup = () => document.querySelector('[data-revealed]') as HTMLElement;

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('media immersive visualizer', () => {
  it('is off by default and offers a toggle', async () => {
    renderTouch();
    await waitFor(() => expect(screen.getByLabelText(SHOW)).toBeTruthy());
    expect(screen.queryByTestId('visualizer')).toBeNull();
  });

  it('renders the stored effect when the config has it on', async () => {
    renderTouch({ visualizer: true, visualizerEffect: 'liquidbeat' });
    await waitFor(() => expect(screen.getByTestId('visualizer').dataset.effect).toBe('liquidbeat'));
    expect(screen.getByLabelText(HIDE)).toBeTruthy();
  });

  it('persists the toggle through onUpdate', async () => {
    const onUpdate = vi.fn();
    renderTouch({}, onUpdate);
    fireEvent.click(await screen.findByLabelText(SHOW));
    expect(onUpdate).toHaveBeenCalledWith({ visualizer: true });
    expect(screen.getByTestId('visualizer')).toBeTruthy();
  });

  it('fades the transport out after the idle delay and a tap brings it back', async () => {
    renderTouch({ visualizer: true });
    await waitFor(() => expect(fadeGroup().dataset.revealed).toBe('true'));

    act(() => { vi.advanceTimersByTime(3_100); });
    expect(fadeGroup().dataset.revealed).toBe('false');

    fireEvent.click(screen.getByLabelText(REVEAL));
    expect(fadeGroup().dataset.revealed).toBe('true');
  });

  it('does not cycle the effect on the tap that reveals the controls', async () => {
    const onUpdate = vi.fn();
    renderTouch({ visualizer: true }, onUpdate);
    act(() => { vi.advanceTimersByTime(3_100); });

    fireEvent.click(screen.getByLabelText(REVEAL));
    expect(screen.getByTestId('visualizer').dataset.effect).toBe(DEFAULT_MEDIA_VISUALIZER);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('cycles to the next effect when tapped while the controls are up', async () => {
    const onUpdate = vi.fn();
    renderTouch({ visualizer: true }, onUpdate);
    await waitFor(() => expect(fadeGroup().dataset.revealed).toBe('true'));

    const next = nextVisualizerEffect(DEFAULT_MEDIA_VISUALIZER);
    fireEvent.click(screen.getByLabelText(NEXT));
    expect(screen.getByTestId('visualizer').dataset.effect).toBe(next);
    expect(onUpdate).toHaveBeenCalledWith({ visualizerEffect: next });
  });

  it('hides the toggle on a surface with no touch input', async () => {
    const widget = { id: 'm', type: 'media', size: '4x4', col: 0, row: 0, config: {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<MediaTouch widget={widget as any} surface="q60" immersiveGrid={{ columns: 4, rows: 4 }} />);
    await waitFor(() => expect(screen.getAllByText('Forever?').length).toBeGreaterThan(0));
    expect(screen.queryByLabelText(SHOW)).toBeNull();
  });
});
