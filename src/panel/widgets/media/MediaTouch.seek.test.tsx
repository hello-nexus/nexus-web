// The seek control must appear only when the session advertises
// controls.isSeekEnabled: the service no-ops a seek for players that cannot
// do it, so an always-on scrubber would look broken rather than absent.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { MediaSession } from '../../../hooks/useMedia';

const seekMedia = vi.fn();

function session(isSeekEnabled: boolean): MediaSession {
  return {
    sourceAppName: 'Spotify',
    song: { title: 'Forever?', artist: 'Chokomignon', album: 'Forever?' },
    playback: { playing: true, stopped: false, shuffled: false, repeatMode: 'None', positionMs: 20_000, durationMs: 100_000 },
    controls: {
      isPlayEnabled: true, isPauseEnabled: true, isNextEnabled: true, isPrevEnabled: true,
      isShuffleEnabled: true, isRepeatModeEnabled: true, isSeekEnabled,
    },
  } as MediaSession;
}

let current = session(true);

vi.mock('../../../hooks/useMedia', () => ({
  useMedia: () => ({ sessions: { Spotify: current } }),
  controlMedia: vi.fn(),
  seekMedia: async (source: string, ms: number) => { seekMedia(source, ms); },
}));
vi.mock('../../../hooks/useSystemVolume', () => ({
  useSystemVolume: () => ({
    state: { supported: false, volume: 0, muted: false },
    previewVolume: vi.fn(), commitVolume: vi.fn(), setMuted: vi.fn(),
  }),
}));
vi.mock('../../../api/service', () => ({ fetchServiceBlob: async () => null }));

const { MediaTouch } = await import('./MediaTouch');

const widget = { id: 'm', type: 'media', size: '4x4', col: 0, row: 0, config: {} };
const SEEK_LABEL = 'panel.media.seek';

function renderTouch() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<MediaTouch widget={widget as any} surface="monitor" deviceTouch immersiveGrid={{ columns: 14, rows: 4 }} />);
}

beforeEach(() => { seekMedia.mockReset(); current = session(true); });
afterEach(() => cleanup());

describe('immersive seek bar', () => {
  it('exposes a slider when the session advertises seek', async () => {
    renderTouch();
    await waitFor(() => expect(screen.getByRole('slider', { name: SEEK_LABEL })).toBeTruthy());
  });

  it('renders a plain progressbar when the player cannot seek', async () => {
    current = session(false);
    renderTouch();
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeTruthy());
    expect(screen.queryByRole('slider', { name: SEEK_LABEL })).toBeNull();
  });

  it('seeks to the released position as a fraction of duration', async () => {
    renderTouch();
    const bar = await screen.findByRole('slider', { name: SEEK_LABEL });
    // jsdom reports a zero-width rect, so pin one to make the maths definite.
    bar.getBoundingClientRect = () => ({ left: 0, width: 200, right: 200, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    fireEvent.pointerDown(bar, { clientX: 50, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 50, pointerId: 1 });

    // 50/200 = 25% of a 100s track.
    expect(seekMedia).toHaveBeenCalledWith('Spotify', 25_000);
  });

  // The poll is 2s and the endpoint is fire-and-forget, so dropping back to the
  // polled position on release made the bar rubber-band to where it started.
  it('holds the requested position after release instead of snapping back', async () => {
    renderTouch();
    const bar = await screen.findByRole('slider', { name: SEEK_LABEL });
    bar.getBoundingClientRect = () => ({ left: 0, width: 200, right: 200, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    // Session sits at 20s of 100s = 20%.
    expect(bar.getAttribute('aria-valuenow')).toBe('20');

    fireEvent.pointerDown(bar, { clientX: 150, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 150, pointerId: 1 });

    // Still reporting the requested 75% while the poll has not caught up.
    expect(bar.getAttribute('aria-valuenow')).toBe('75');
  });

  it('releases the hold once a poll confirms the new position', async () => {
    const { rerender } = renderTouch();
    const bar = await screen.findByRole('slider', { name: SEEK_LABEL });
    bar.getBoundingClientRect = () => ({ left: 0, width: 200, right: 200, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    fireEvent.pointerDown(bar, { clientX: 150, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 150, pointerId: 1 });
    expect(bar.getAttribute('aria-valuenow')).toBe('75');

    // Poll now reports the player at the sought position; the bar should track
    // server truth again rather than stay pinned.
    current = { ...current, playback: { ...current.playback, positionMs: 75_000 } } as MediaSession;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rerender(<MediaTouch widget={widget as any} surface="monitor" deviceTouch immersiveGrid={{ columns: 14, rows: 4 }} />);
    await waitFor(() => expect(screen.getByRole('slider', { name: SEEK_LABEL }).getAttribute('aria-valuenow')).toBe('75'));
  });

  it('does not seek on a drag that is cancelled', async () => {
    renderTouch();
    const bar = await screen.findByRole('slider', { name: SEEK_LABEL });
    fireEvent.pointerDown(bar, { clientX: 10, pointerId: 1 });
    fireEvent.pointerCancel(bar, { pointerId: 1 });
    expect(seekMedia).not.toHaveBeenCalled();
  });
});
