// The service serves the SPA for unknown paths, so /album-art-hd answers 200
// text/html on a service predating that route. Handing those bytes to
// createObjectURL renders a broken <img>, so non-image blobs must be rejected
// and the shared placeholder frame shown instead.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, fireEvent } from '@testing-library/react';
import type { MediaSession } from '../../../hooks/useMedia';

const session: MediaSession = {
  sourceAppName: 'Spotify',
  song: { title: 'Forever?', artist: 'Chokomignon', album: 'Forever?' },
  playback: { playing: true, stopped: false, shuffled: false, repeatMode: 'None', positionMs: 0, durationMs: 1000 },
  controls: {
    isPlayEnabled: true, isPauseEnabled: true, isNextEnabled: true, isPrevEnabled: true,
    isShuffleEnabled: true, isRepeatModeEnabled: true, isSeekEnabled: true,
  },
} as MediaSession;

const fetchServiceBlob = vi.fn();

vi.mock('../../../hooks/useMedia', () => ({
  useMedia: () => ({ sessions: { Spotify: session } }),
  controlMedia: vi.fn(),
}));
vi.mock('../../../hooks/useSystemVolume', () => ({
  useSystemVolume: () => ({
    state: { supported: false, volume: 0, muted: false },
    previewVolume: vi.fn(),
    commitVolume: vi.fn(),
    setMuted: vi.fn(),
  }),
}));
vi.mock('../../../api/service', () => ({
  fetchServiceBlob: (path: string) => fetchServiceBlob(path),
}));

const { MediaTouch } = await import('./MediaTouch');

beforeEach(() => {
  fetchServiceBlob.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:stub');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

// The blurred backdrop adds a second <img>; these assertions target the art
// cell's own image so the backdrop cannot mask a cell-side regression.
const cellImg = () => document.querySelector('[class*="artCell"] img');

function widget() {
  return { id: 'm', type: 'media', size: '4x4', col: 0, row: 0, config: {} };
}

describe('MediaTouch album art', () => {
  it('ignores an HTML body served with 200 and keeps the placeholder', async () => {
    fetchServiceBlob.mockResolvedValue(new Blob(['<!doctype html>'], { type: 'text/html' }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<MediaTouch widget={widget() as any} immersiveGrid={{ columns: 14, rows: 4 }} />);
    await waitFor(() => expect(fetchServiceBlob).toHaveBeenCalled());
    expect(cellImg()).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('renders the art when the service returns image bytes', async () => {
    fetchServiceBlob.mockResolvedValue(new Blob(['\x89PNG'], { type: 'image/png' }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<MediaTouch widget={widget() as any} immersiveGrid={{ columns: 14, rows: 4 }} />);
    await waitFor(() => expect(cellImg()).not.toBeNull());
  });

  it('falls back to the placeholder when the image fails to decode', async () => {
    fetchServiceBlob.mockResolvedValue(new Blob(['not-really-png'], { type: 'image/png' }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<MediaTouch widget={widget() as any} immersiveGrid={{ columns: 14, rows: 4 }} />);
    await waitFor(() => expect(cellImg()).not.toBeNull());
    fireEvent.error(cellImg() as HTMLImageElement);
    await waitFor(() => expect(cellImg()).toBeNull());
  });
});
