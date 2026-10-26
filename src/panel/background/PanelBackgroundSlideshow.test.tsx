import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundMediaItem } from '../../api/panelBackgroundMedia';
import { PanelBackgroundSlideshow } from './PanelBackgroundSlideshow';

const api = vi.hoisted(() => ({
  items: [] as BackgroundMediaItem[],
  // Asset ids whose layer reports a decode failure instead of a load.
  broken: new Set<string>(),
  // Asset ids whose layer neither loads nor fails.
  stalled: new Set<string>(),
  // Latest onVideoEnded handler per mounted video layer.
  ended: new Map<string, (video: HTMLVideoElement) => void>(),
  // Latest onFailed handler per mounted layer, to fail one on demand.
  failers: new Map<string, () => void>(),
}));

vi.mock('../../api/panelBackgroundMedia', () => ({
  fetchBackgroundMediaLibrary: vi.fn(() => Promise.resolve({ items: api.items })),
}));
vi.mock('../../hooks/useMultiplexSocket', () => ({ useTopicCallback: () => {} }));

// A layer that decodes on mount and whose fade-in completes as soon as it is
// ready, so the slideshow's own state machine is what the clock drives.
vi.mock('./PanelBackgroundMedia', () => ({
  PanelBackgroundMedia: ({ id, type, alpha, ready = true, onLoaded, onFadedIn, onFailed, onVideoEnded }: {
    id: string; type: string; alpha?: boolean; ready?: boolean; onLoaded?: () => void; onFadedIn?: () => void;
    onFailed?: () => void; onVideoEnded?: (video: HTMLVideoElement) => void;
  }) => {
    const isVideo = type === 'animated' && !alpha;
    if (isVideo && onVideoEnded) api.ended.set(id, onVideoEnded);
    if (onFailed) api.failers.set(id, onFailed);
    useEffect(() => () => { api.ended.delete(id); }, [id]);
    useEffect(() => {
      if (api.broken.has(id)) onFailed?.();
      else if (!api.stalled.has(id)) onLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);
    useEffect(() => {
      if (ready) onFadedIn?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready]);
    return isVideo
      ? <video data-testid="slide" data-id={id} data-ready={ready ? 'true' : undefined} />
      : <div data-testid="slide" data-id={id} data-ready={ready ? 'true' : undefined} />;
  },
}));

const item = (id: string, importedAtUnixMs: number): BackgroundMediaItem => ({
  id, name: id, sourceExt: '.jpg', type: 'static', width: 1, height: 1, importedAtUnixMs, durationSec: 0, alpha: false,
});

const video = (id: string, importedAtUnixMs: number): BackgroundMediaItem => ({
  ...item(id, importedAtUnixMs), sourceExt: '.mp4', type: 'animated', durationSec: 20,
});

// A stand-in for the layer's element: the slideshow only reads duration and replays it.
const fakeVideo = () => ({ duration: 20, currentTime: 7, play: vi.fn(() => Promise.resolve()) });
const endVideo = async (id: string, el: ReturnType<typeof fakeVideo>) => {
  await act(async () => { api.ended.get(id)?.(el as unknown as HTMLVideoElement); });
};

const shown = () => screen.getAllByTestId('slide').map(el => el.getAttribute('data-id'));

async function renderShow(startId: string | null, over: Partial<{ shuffle: boolean; order: string[]; covered: boolean }> = {}) {
  const view = render(
    <PanelBackgroundSlideshow
      deviceId="dev1"
      startId={startId}
      intervalSec={10}
      shuffle={over.shuffle ?? false}
      finishVideos
      order={over.order ?? []}
      opacity={1}
      covered={over.covered}
    />,
  );
  // The library fetch resolves on the microtask queue.
  await act(async () => { await Promise.resolve(); });
  return view;
}

const tick = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

beforeEach(() => {
  vi.useFakeTimers();
  api.items = [];
  api.broken.clear();
  api.stalled.clear();
  api.ended.clear();
  api.failers.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('PanelBackgroundSlideshow', () => {
  it('opens on the selected slide and keeps cycling through a lap wrap', async () => {
    // Library order is newest first; the cycle runs oldest first.
    api.items = [item('b', 2), item('a', 1)];
    await renderShow('b');
    expect(shown()).toEqual(['b']);
    await tick(10_000);
    expect(shown()).toEqual(['a']);
    await tick(10_000);
    expect(shown()).toEqual(['b']);
    await tick(10_000);
    expect(shown()).toEqual(['a']);
  });

  it('walks three slides in import order from the pick and wraps', async () => {
    api.items = [item('c', 3), item('b', 2), item('a', 1)];
    await renderShow('b');
    const seen = [shown()[0]];
    for (let i = 0; i < 4; i++) {
      await tick(10_000);
      seen.push(shown()[0]);
    }
    expect(seen).toEqual(['b', 'c', 'a', 'b', 'c']);
  });

  it('skips a slide the panel cannot decode', async () => {
    api.items = [item('c', 3), item('b', 2), item('a', 1)];
    api.broken.add('b');
    await renderShow('a');
    await tick(10_000);
    expect(shown()).toEqual(['c']);
    await tick(10_000);
    expect(shown()).toEqual(['a']);
  });

  it('holds the current slide while an opaque widget covers the background', async () => {
    api.items = [item('b', 2), item('a', 1)];
    const view = await renderShow('b', { covered: true });
    await tick(30_000);
    expect(shown()).toEqual(['b']);
    view.rerender(
      <PanelBackgroundSlideshow deviceId="dev1" startId="b" intervalSec={10} shuffle={false} finishVideos order={[]} opacity={1} covered={false} />,
    );
    await tick(10_000);
    expect(shown()).toEqual(['a']);
  });

  it('holds a single slide without ticking', async () => {
    api.items = [item('a', 1)];
    await renderShow('a');
    await tick(60_000);
    expect(shown()).toEqual(['a']);
  });

  it('follows the saved order instead of import order', async () => {
    api.items = [item('c', 3), item('b', 2), item('a', 1)];
    await renderShow('c', { order: ['c', 'a', 'b'] });
    const seen = [shown()[0]];
    for (let i = 0; i < 3; i++) {
      await tick(10_000);
      seen.push(shown()[0]);
    }
    expect(seen).toEqual(['c', 'a', 'b', 'c']);
  });

  it('jumps to a slide picked in the editor', async () => {
    api.items = [item('c', 3), item('b', 2), item('a', 1)];
    const view = await renderShow('a');
    view.rerender(
      <PanelBackgroundSlideshow deviceId="dev1" startId="c" intervalSec={10} shuffle={false} finishVideos order={[]} opacity={1} />,
    );
    await act(async () => {});
    expect(shown()).toEqual(['c']);
    await tick(10_000);
    expect(shown()).toEqual(['a']);
  });

  it('falls back to the solid background color when the library is empty or every slide fails', async () => {
    const { container, unmount } = await renderShow(null);
    expect(screen.queryAllByTestId('slide')).toHaveLength(0);
    expect(container.querySelector('[data-panel-bg-layer]')?.className).toMatch(/backgroundSolid/);
    unmount();

    api.items = [item('a', 2)];
    api.broken.add('a');
    const broken = await renderShow(null);
    await tick(0);
    expect(broken.container.querySelector('[data-panel-bg-layer]')?.className).toMatch(/backgroundSolid/);
  });

  it('cuts video to video: one <video> mounted after the advance, and the ended clip is not replayed', async () => {
    api.items = [video('b', 2), video('a', 1)];
    const { container } = await renderShow('a');
    expect(container.querySelectorAll('video')).toHaveLength(1);
    const el = fakeVideo();
    await endVideo('a', el);
    expect(shown()).toEqual(['b']);
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(el.play).not.toHaveBeenCalled();
    expect(el.currentTime).toBe(7);
  });

  it('skips a video that fails after a cut and falls back to solid when every video fails', async () => {
    api.items = [video('c', 3), video('b', 2), video('a', 1)];
    api.broken.add('b');
    const { container } = await renderShow('a');
    await endVideo('a', fakeVideo());
    expect(shown()).not.toContain('b');
    expect(container.querySelectorAll('video')).toHaveLength(1);

    api.broken.add('c');
    api.broken.add('a');
    await endVideo(shown()[0] as string, fakeVideo());
    await tick(0);
    expect(screen.queryAllByTestId('slide')).toHaveLength(0);
    expect(container.querySelector('[data-panel-bg-layer]')?.className).toMatch(/backgroundSolid/);
  });

  it('keeps the crossfade between a video and a still and holds the video on its last frame', async () => {
    api.items = [item('b', 2), video('a', 1)];
    await renderShow('a');
    const el = fakeVideo();
    await endVideo('a', el);
    await tick(1000);
    expect(shown()).toEqual(['b']);
    expect(el.play).not.toHaveBeenCalled();
  });

  it('replays a clip that is shorter than the interval', async () => {
    api.items = [video('b', 2), video('a', 1)];
    await renderShow('a');
    const el = { ...fakeVideo(), duration: 4 };
    await endVideo('a', el);
    expect(shown()).toEqual(['a']);
    expect(el.play).toHaveBeenCalled();
    expect(el.currentTime).toBe(0);
  });

  it('restarts an ended video when the still staged after it fails to load', async () => {
    api.items = [item('b', 2), video('a', 1)];
    api.broken.add('b');
    await renderShow('a');
    const el = fakeVideo();
    await endVideo('a', el);
    await tick(0);
    expect(shown()).toEqual(['a']);
    expect(el.play).toHaveBeenCalledTimes(1);
    expect(el.currentTime).toBe(0);
  });

  it('leaves an ended video alone when the staged still fails while an opaque widget covers it', async () => {
    api.items = [item('b', 2), video('a', 1)];
    api.stalled.add('b');
    const view = await renderShow('a');
    const el = fakeVideo();
    await endVideo('a', el);
    view.rerender(
      <PanelBackgroundSlideshow deviceId="dev1" startId="a" intervalSec={10} shuffle={false} finishVideos order={[]} opacity={1} covered />,
    );
    await act(async () => { api.failers.get('b')?.(); });
    expect(shown()).toEqual(['a']);
    expect(el.play).not.toHaveBeenCalled();
  });

  it('does not restart an ended video that a successful crossfade replaces', async () => {
    api.items = [item('b', 2), video('a', 1)];
    await renderShow('a');
    const el = fakeVideo();
    await endVideo('a', el);
    await tick(1000);
    expect(shown()).toEqual(['b']);
    expect(el.play).not.toHaveBeenCalled();
  });

  it('fails a cut-in video that never reaches canplay and moves past it for good', async () => {
    api.items = [video('c', 3), video('b', 2), video('a', 1)];
    api.stalled.add('b');
    await renderShow('a');
    await endVideo('a', fakeVideo());
    expect(shown()).toEqual(['b']);
    // The interval tick and the paced-video ceiling wait on the stalled clip.
    await tick(29_000);
    expect(shown()).toEqual(['b']);
    await tick(1000);
    expect(shown()).toEqual(['c']);
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      await endVideo(shown()[0] as string, fakeVideo());
      seen.push(shown()[0]);
    }
    expect(seen).not.toContain('b');
  });

  it('keeps the cadence once a cut-in video reaches canplay', async () => {
    api.items = [video('c', 3), video('b', 2), video('a', 1)];
    await renderShow('a');
    await endVideo('a', fakeVideo());
    expect(shown()).toEqual(['b']);
    await endVideo('b', fakeVideo());
    expect(shown()).toEqual(['c']);
  });
});
