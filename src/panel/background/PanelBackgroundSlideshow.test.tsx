import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundMediaItem } from '../../api/panelBackgroundMedia';
import { PanelBackgroundSlideshow } from './PanelBackgroundSlideshow';

const api = vi.hoisted(() => ({
  items: [] as BackgroundMediaItem[],
  // Asset ids whose layer reports a decode failure instead of a load.
  broken: new Set<string>(),
}));

vi.mock('../../api/panelBackgroundMedia', () => ({
  fetchBackgroundMediaLibrary: vi.fn(() => Promise.resolve({ items: api.items })),
}));
vi.mock('../../hooks/useMultiplexSocket', () => ({ useTopicCallback: () => {} }));

// A layer that decodes on mount and whose fade-in completes as soon as it is
// ready, so the slideshow's own state machine is what the clock drives.
vi.mock('./PanelBackgroundMedia', () => ({
  PanelBackgroundMedia: ({ id, ready = true, onLoaded, onFadedIn, onFailed }: {
    id: string; ready?: boolean; onLoaded?: () => void; onFadedIn?: () => void; onFailed?: () => void;
  }) => {
    useEffect(() => {
      if (api.broken.has(id)) onFailed?.();
      else onLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);
    useEffect(() => {
      if (ready) onFadedIn?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready]);
    return <div data-testid="slide" data-id={id} data-ready={ready ? 'true' : undefined} />;
  },
}));

const item = (id: string, importedAtUnixMs: number): BackgroundMediaItem => ({
  id, name: id, sourceExt: '.jpg', type: 'static', width: 1, height: 1, importedAtUnixMs, durationSec: 0, alpha: false,
});

const shown = () => screen.getAllByTestId('slide').map(el => el.getAttribute('data-id'));

async function renderShow(startId: string | null, over: Partial<{ shuffle: boolean; order: string[] }> = {}) {
  const view = render(
    <PanelBackgroundSlideshow
      deviceId="dev1"
      startId={startId}
      intervalSec={10}
      shuffle={over.shuffle ?? false}
      finishVideos
      order={over.order ?? []}
      opacity={1}
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
});
