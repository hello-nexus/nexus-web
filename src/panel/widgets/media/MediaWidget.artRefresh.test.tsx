// Players set the thumbnail after the title, so the service bumps
// song.artVersion when it lands. The widgets refetch on that bump, and the
// art already showing for the same track stays up until the new result does.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import type { MediaSession } from '../../../hooks/useMedia';

function session(artVersion: number): MediaSession {
  return {
    sourceAppName: 'Spotify',
    song: { title: 'Smack That', artist: 'Akon', album: '', artVersion },
    playback: { playing: true, stopped: false, shuffled: false, repeatMode: 'None', positionMs: 0, durationMs: 1000 },
    controls: {
      isPlayEnabled: true, isPauseEnabled: true, isNextEnabled: true, isPrevEnabled: true,
      isShuffleEnabled: true, isRepeatModeEnabled: true, isSeekEnabled: true,
    },
  };
}

let current = session(0);
const fetchServiceBlob = vi.fn();

vi.mock('../../../hooks/useMedia', () => ({
  useMedia: () => ({ sessions: { Spotify: current } }),
  controlMedia: vi.fn(),
  seekMedia: vi.fn(),
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

const { MediaWidget } = await import('./MediaWidget');
const { MediaTouch } = await import('./MediaTouch');

const png = () => new Blob(['\x89PNG'], { type: 'image/png' });
const artCalls = () => fetchServiceBlob.mock.calls.filter(([p]) => String(p).endsWith('/album-art')).length;

let urls = 0;
beforeEach(() => {
  current = session(0);
  urls = 0;
  fetchServiceBlob.mockReset();
  URL.createObjectURL = vi.fn(() => `blob:${++urls}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

const widget = { id: 'm', type: 'media', size: '4x4', col: 0, row: 0, config: {} };

const cases = [
  {
    name: 'MediaWidget',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    el: () => <MediaWidget widget={widget as any} surface="y70" />,
    img: () => document.querySelector('[class*="artWrap"] img'),
  },
  {
    name: 'MediaTouch',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    el: () => <MediaTouch widget={widget as any} immersiveGrid={{ columns: 14, rows: 4 }} />,
    img: () => document.querySelector('[class*="artCell"] img'),
  },
];

describe.each(cases)('$name art refresh on artVersion', ({ el, img }) => {
  it('refetches on a bump and keeps the current art until the new one lands', async () => {
    fetchServiceBlob.mockImplementation((p: string) => (p.endsWith('/album-art') ? Promise.resolve(png()) : Promise.resolve(null)));
    const view = render(el());
    await waitFor(() => expect(img()?.getAttribute('src')).toBe('blob:1'));
    const before = artCalls();

    let land: (b: Blob) => void = () => {};
    fetchServiceBlob.mockImplementation((p: string) => (p.endsWith('/album-art')
      ? new Promise<Blob>(resolve => { land = resolve; })
      : Promise.resolve(null)));
    current = session(1);
    view.rerender(el());

    expect(artCalls()).toBe(before + 1);
    expect(img()?.getAttribute('src')).toBe('blob:1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:1');

    await act(async () => { land(png()); });
    await waitFor(() => expect(img()?.getAttribute('src')).toBe('blob:2'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });

  it('shows the art when it first arrives on a bump for the same track', async () => {
    fetchServiceBlob.mockResolvedValue(null);
    const view = render(el());
    await waitFor(() => expect(artCalls()).toBe(1));
    expect(img()).toBeNull();

    fetchServiceBlob.mockImplementation((p: string) => Promise.resolve(p.endsWith('/album-art') ? png() : null));
    current = session(1);
    view.rerender(el());

    await waitFor(() => expect(img()).not.toBeNull());
  });
});
