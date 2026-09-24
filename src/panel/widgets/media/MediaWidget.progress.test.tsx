// The media topic sends no frame while playback runs at 1x (the publisher
// predicts the position), so the tile has to tick the bar between frames.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import type { MediaSession } from '../../../hooks/useMedia';

function session(overrides: Partial<MediaSession['playback']> = {}): MediaSession {
  return {
    sourceAppName: 'Spotify',
    song: { title: 'Human', artist: 'Rag\'n\'Bone Man', album: 'Human' },
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
}));
vi.mock('../../../hooks/useSystemVolume', () => ({
  useSystemVolume: () => ({
    state: { supported: false, volume: 0, muted: false },
    previewVolume: vi.fn(), commitVolume: vi.fn(), setMuted: vi.fn(),
  }),
}));
vi.mock('../../../api/service', () => ({ fetchServiceBlob: async () => null }));

const { MediaWidget } = await import('./MediaWidget');

const widget = { id: 'm', type: 'media', size: '4x2', col: 0, row: 0, config: {} };

function renderTile() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<MediaWidget widget={widget as any} surface="y70" />);
}

function fillWidth(container: HTMLElement): string {
  const fill = container.querySelector('[class*="progressFill"]') as HTMLElement;
  return fill.style.width;
}

// Only the tick clock is faked; setTimeout stays real so waitFor still runs.
const TICK_CLOCK = ['setInterval', 'clearInterval', 'performance'] as const;

beforeEach(() => { current = session(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('media tile progress bar', () => {
  it('advances while playing, without a new frame', async () => {
    vi.useFakeTimers({ toFake: [...TICK_CLOCK] });
    const { container } = renderTile();
    await waitFor(() => expect(fillWidth(container)).toBe('20%'));
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(fillWidth(container)).toBe('25%');
  });

  it('holds while paused', async () => {
    current = session({ playing: false });
    vi.useFakeTimers({ toFake: [...TICK_CLOCK] });
    const { container } = renderTile();
    await waitFor(() => expect(fillWidth(container)).toBe('20%'));
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(fillWidth(container)).toBe('20%');
  });
});
