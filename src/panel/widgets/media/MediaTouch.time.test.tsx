// The immersive player shows elapsed/total flanking the seek bar; both come
// from the same session payload the bar reads, and disappear with it when a
// player reports no duration.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';
import type { MediaSession } from '../../../hooks/useMedia';

function session(overrides: Partial<MediaSession['playback']> = {}): MediaSession {
  return {
    sourceAppName: 'Spotify',
    song: { title: 'Forever?', artist: 'Chokomignon', album: 'Forever?' },
    playback: { playing: true, stopped: false, shuffled: false, repeatMode: 'None', positionMs: 20_000, durationMs: 100_000, ...overrides },
    controls: {
      isPlayEnabled: true, isPauseEnabled: true, isNextEnabled: true, isPrevEnabled: true,
      isShuffleEnabled: true, isRepeatModeEnabled: true, isSeekEnabled: true,
    },
  } as MediaSession;
}

let current = session();

vi.mock('../../../hooks/useMedia', () => ({
  useMedia: () => ({ sessions: { Spotify: current } }),
  controlMedia: vi.fn(),
  seekMedia: vi.fn(async () => {}),
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

function renderTouch() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<MediaTouch widget={widget as any} surface="monitor" deviceTouch immersiveGrid={{ columns: 14, rows: 4 }} />);
}

beforeEach(() => { current = session(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

function readElapsed(container: HTMLElement): string {
  // StableDigits stacks an aria-hidden sizer glyph under each digit.
  const el = container.querySelectorAll('[class*="seekTime"]')[0].cloneNode(true) as HTMLElement;
  el.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove());
  return el.textContent ?? '';
}

describe('immersive track time labels', () => {
  it('shows elapsed and total flanking the seek bar', async () => {
    const { container } = renderTouch();
    await waitFor(() => expect(screen.getByText('1:40')).toBeTruthy());
    expect(container.querySelectorAll('[class*="seekTime"]').length).toBe(2);
    expect(readElapsed(container)).toBe('0:20');
  });

  // Only the tick clock is faked; setTimeout stays real so waitFor still runs.
  const TICK_CLOCK = { toFake: ['setInterval', 'clearInterval', 'performance'] as const };

  it('ticks the elapsed readout while playing, without a new poll', async () => {
    vi.useFakeTimers({ toFake: [...TICK_CLOCK.toFake] });
    const { container } = renderTouch();
    await waitFor(() => expect(readElapsed(container)).toBe('0:20'));
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(readElapsed(container)).toBe('0:24');
  });

  it('holds the elapsed readout while paused', async () => {
    current = session({ playing: false });
    vi.useFakeTimers({ toFake: [...TICK_CLOCK.toFake] });
    const { container } = renderTouch();
    await waitFor(() => expect(readElapsed(container)).toBe('0:20'));
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(readElapsed(container)).toBe('0:20');
  });

  it('renders the exact second the position reports', async () => {
    // A percent round-trip through the bar geometry lands this a second low.
    current = session({ positionMs: 45_000, durationMs: 97_000 });
    const { container } = renderTouch();
    await waitFor(() => expect(readElapsed(container)).toBe('0:45'));
  });

  it('moves the elapsed readout with the fill while scrubbing', async () => {
    const { container } = renderTouch();
    const bar = await screen.findByRole('slider', { name: 'panel.media.seek' });
    bar.getBoundingClientRect = () => ({ left: 0, width: 200, right: 200, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => '' });

    fireEvent.pointerDown(bar, { clientX: 150, pointerId: 1 });

    const elapsed = container.querySelectorAll('[class*="seekTime"]')[0].cloneNode(true) as HTMLElement;
    elapsed.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove());
    // 75% of a 100s track: the readout tracks the drag, not the poll.
    expect(elapsed.textContent).toBe('1:15');
  });

  it('keeps the post-seek hold across ticks, since only a poll can confirm it', async () => {
    vi.useFakeTimers({ toFake: [...TICK_CLOCK.toFake] });
    const { container } = renderTouch();
    const bar = await screen.findByRole('slider', { name: 'panel.media.seek' });
    bar.getBoundingClientRect = () => ({ left: 0, width: 200, right: 200, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => '' });

    // Seek a few seconds ahead of the current 20s: close enough that a ticking
    // position would fall inside the confirm window without any poll landing.
    fireEvent.pointerDown(bar, { clientX: 46, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 46, pointerId: 1 });
    expect(readElapsed(container)).toBe('0:23');

    act(() => { vi.advanceTimersByTime(4_000); });
    // Still the requested position: the hold released only if a tick was
    // mistaken for the confirming poll.
    expect(readElapsed(container)).toBe('0:23');
    expect(bar.getAttribute('aria-valuenow')).toBe('23');
  });

  it('renders no time labels when the player reports no duration', async () => {
    current = session({ durationMs: 0 });
    const { container } = renderTouch();
    await waitFor(() => expect(screen.getByRole('button', { name: 'panel.media.pause' })).toBeTruthy());
    expect(container.querySelectorAll('[class*="seekTime"]').length).toBe(0);
  });
});
