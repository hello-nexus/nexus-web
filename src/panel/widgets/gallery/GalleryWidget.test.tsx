import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { GalleryWidget } from './GalleryWidget';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';

const mockItems = vi.hoisted(() => ({
  current: [] as { id: string; name: string; sourceId: string; kind: 'image' | 'video' }[],
  // Item ids whose poster request must come back empty (no ffmpeg on the PC).
  noPoster: new Set<string>(),
}));

// Only the network call is stubbed; the width helpers are the real ones, so a
// drift between them and the service's buckets shows up here.
vi.mock('../../../api/gallery', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/gallery')>()),
  fetchGalleryItems: vi.fn(() => Promise.resolve({ items: mockItems.current })),
}));

vi.mock('../../../api/service', () => ({
  // Tag each blob with the item id so createObjectURL can mint a
  // distinguishable URL - lets assertions check WHICH image is shown.
  fetchServiceBlob: vi.fn((path: string) => {
    const id = /\/gallery\/items\/(.+)\/file/.exec(path)?.[1] ?? 'unknown';
    if (mockItems.noPoster.has(id)) return Promise.resolve(null);
    const blob = new Blob(['img']) as Blob & { tag?: string };
    blob.tag = id;
    return Promise.resolve(blob);
  }),
  // galleryItemVideoUrl builds the <video src> from these.
  resolveHttp: (path: string) => `http://svc${path}`,
  tokenParam: () => 'token=t',
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => {
  // Single stable t - components may put it in effect deps.
  const t = (key: string) => ({
    'gallery.empty.title': 'No images or videos',
    'gallery.empty.text': 'Add images or videos on the Gallery page',
    'gallery.empty.noVideos': 'No videos in the gallery',
    'gallery.empty.noImages': 'No images in the gallery',
    'gallery.panel.prev': 'Previous',
    'gallery.panel.next': 'Next',
  }[key] ?? key);
  return { useTranslation: () => ({ t }) };
});

// Unique id per call: the module-level position memory keys off widget.id,
// so reusing one id would leak the shown photo between unrelated tests.
let widgetSeq = 0;
function galleryWidget(config?: PanelWidget['config'], id?: string): PanelWidget {
  return { id: id ?? `gallery-${++widgetSeq}`, type: 'gallery', size: '4x4', col: 0, row: 0, config };
}

function items(...ids: string[]) {
  return ids.map(id => ({ id, name: `${id}.png`, sourceId: 'src-1', kind: 'image' as const }));
}

function video(id: string) {
  return { id, name: `${id}.mp4`, sourceId: 'src-1', kind: 'video' as const };
}

function shownImage(): string | null {
  return document.querySelector('img')?.getAttribute('src') ?? null;
}

function shownVideo(): HTMLVideoElement | null {
  return document.querySelector('video');
}

/** Report the clip's length, as the element does once metadata is in. */
function setDuration(durationSec: number) {
  const el = shownVideo()!;
  Object.defineProperty(el, 'duration', { value: durationSec, configurable: true });
  el.dispatchEvent(new Event('loadedmetadata'));
}

/** Finish one play of the current clip, as the element would report it. */
function endVideo(durationSec: number) {
  setDuration(durationSec);
  shownVideo()!.dispatchEvent(new Event('ended'));
}

// Flush the fetch → setItems → load-blob → bump cascade under fake timers.
async function flushAsync() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockItems.current = [];
  mockItems.noPoster.clear();
  globalThis.URL.createObjectURL = vi.fn((blob: Blob & { tag?: string }) => `blob:${blob.tag ?? 'x'}`);
  globalThis.URL.revokeObjectURL = vi.fn();
  // jsdom has no media pipeline: play() is "not implemented" and returns
  // undefined instead of a promise.
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GalleryWidget', () => {
  it('renders the standard empty state when there are no images', async () => {
    render(<GalleryWidget widget={galleryWidget()} />);

    expect(await screen.findByText('No images or videos')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  // The pick has to reach the device, not just move the preview, so it lives
  // in widget config rather than the module-level position memory.
  it('persists the picked image when the user navigates in single mode', async () => {
    mockItems.current = items('a', 'b', 'c');
    const onUpdate = vi.fn();
    render(<GalleryWidget widget={galleryWidget({ mode: 'single' })} onUpdate={onUpdate} />);
    await waitFor(() => expect(shownImage()).toBe('blob:a'));

    fireEvent.click(screen.getByLabelText('Next'));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ imageId: 'b' }));
  });

  it('does not persist while a slideshow is running', async () => {
    mockItems.current = items('a', 'b', 'c');
    const onUpdate = vi.fn();
    render(
      <GalleryWidget
        widget={galleryWidget({ mode: 'slideshow', interval: 5 })}
        onUpdate={onUpdate}
      />,
    );
    await waitFor(() => expect(shownImage()).toBe('blob:a'));

    // A deliberate move still advances the view, but a slideshow rewriting the
    // layout every few seconds is what this guards against.
    fireEvent.click(screen.getByLabelText('Next'));
    await waitFor(() => expect(shownImage()).toBe('blob:b'));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('opens on the picked image and follows a pick made elsewhere', async () => {
    mockItems.current = items('a', 'b', 'c');
    const { rerender } = render(<GalleryWidget widget={galleryWidget({ mode: 'single', imageId: 'c' }, 'w-pick')} />);
    await waitFor(() => expect(shownImage()).toBe('blob:c'));

    // The edit sheet (or another surface) writing the field must move this view.
    rerender(<GalleryWidget widget={galleryWidget({ mode: 'single', imageId: 'b' }, 'w-pick')} />);

    await waitFor(() => expect(shownImage()).toBe('blob:b'));
  });

  it('keeps an arrow tap off the cell click-to-edit handler', async () => {
    mockItems.current = items('a', 'b');
    const onCellClick = vi.fn();
    render(
      <div onClick={onCellClick}>
        <GalleryWidget widget={galleryWidget({ mode: 'single' })} onUpdate={vi.fn()} />
      </div>,
    );
    await waitFor(() => expect(shownImage()).toBe('blob:a'));

    fireEvent.click(screen.getByLabelText('Next'));

    // In the editing canvas the whole cell opens the settings sheet; the
    // arrows sit inside it and must not trigger that.
    expect(onCellClick).not.toHaveBeenCalled();
  });

  it('marks the tile for the editor-only hover reveal', async () => {
    mockItems.current = items('a', 'b');
    const { container, rerender } = render(<GalleryWidget widget={galleryWidget()} editorPreview />);
    await waitFor(() => expect(shownImage()).toBe('blob:a'));
    expect((container.firstElementChild as HTMLElement).getAttribute('data-editor-preview')).toBe('true');

    // Absent on the device: a touch panel reveals the arrows by tap, and a
    // stuck :hover would pin them on.
    rerender(<GalleryWidget widget={galleryWidget()} />);
    expect((container.firstElementChild as HTMLElement).getAttribute('data-editor-preview')).toBeNull();
  });

  it('shows a single image without arrows', async () => {
    mockItems.current = items('a');
    render(<GalleryWidget widget={galleryWidget()} />);

    await waitFor(() => expect(shownImage()).toBe('blob:a'));
    expect(screen.queryByLabelText('Previous')).toBeNull();
    expect(screen.queryByLabelText('Next')).toBeNull();
  });

  it('navigates with arrows, revealing them and fading after idle', async () => {
    mockItems.current = items('a', 'b', 'c');
    const { container } = render(<GalleryWidget widget={galleryWidget()} />);
    await waitFor(() => expect(shownImage()).toBe('blob:a'));

    const viewer = container.firstElementChild as HTMLElement;
    expect(viewer.getAttribute('data-arrows-visible')).toBe('false');

    fireEvent.click(screen.getByLabelText('Next'));
    await waitFor(() => expect(shownImage()).toBe('blob:b'));
    expect(viewer.getAttribute('data-arrows-visible')).toBe('true');

    // Wrap-around going backwards from index 1 → 0 → prev again lands on c.
    fireEvent.click(screen.getByLabelText('Previous'));
    await waitFor(() => expect(shownImage()).toBe('blob:a'));
    fireEvent.click(screen.getByLabelText('Previous'));
    await waitFor(() => expect(shownImage()).toBe('blob:c'));
  });

  it('arrows fade out after the idle delay', async () => {
    mockItems.current = items('a', 'b');
    vi.useFakeTimers();
    const { container } = render(<GalleryWidget widget={galleryWidget()} />);
    await flushAsync();
    expect(shownImage()).toBe('blob:a');

    const viewer = container.firstElementChild as HTMLElement;
    fireEvent.click(screen.getByLabelText('Next'));
    await flushAsync();
    expect(viewer.getAttribute('data-arrows-visible')).toBe('true');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(viewer.getAttribute('data-arrows-visible')).toBe('false');
  });

  it('slideshow mode auto-advances after the configured interval', async () => {
    mockItems.current = items('a', 'b');
    vi.useFakeTimers();
    render(<GalleryWidget widget={galleryWidget({ mode: 'slideshow', interval: 5 })} />);
    await flushAsync();
    expect(shownImage()).toBe('blob:a');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });
    expect(shownImage()).toBe('blob:b');
  });

  // The regression that shipped past review once: PanelApp mints a fresh
  // onUpdate every render and a kiosk re-renders on its ~5s /ping poll, so a
  // slideshow keyed on that callback re-armed its interval from zero forever
  // and never advanced on a real device.
  it('keeps advancing when the parent re-renders with a new onUpdate identity', async () => {
    mockItems.current = items('a', 'b');
    vi.useFakeTimers();
    const widget = galleryWidget({ mode: 'slideshow', interval: 5 }, 'w-churn');
    const { rerender } = render(<GalleryWidget widget={widget} onUpdate={() => {}} />);
    await flushAsync();
    expect(shownImage()).toBe('blob:a');

    // Two parent re-renders inside one interval, each with a fresh callback.
    for (let i = 0; i < 2; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      rerender(<GalleryWidget widget={widget} onUpdate={() => {}} />);
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    expect(shownImage()).toBe('blob:b');
  });

  it('an auto-advance never writes config', async () => {
    mockItems.current = items('a', 'b');
    vi.useFakeTimers();
    const onUpdate = vi.fn();
    render(<GalleryWidget widget={galleryWidget({ mode: 'slideshow', interval: 5 })} onUpdate={onUpdate} />);
    await flushAsync();

    // One tick only: two images and two ticks would land back on 'a'.
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });

    expect(shownImage()).toBe('blob:b');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('single mode never auto-advances', async () => {
    mockItems.current = items('a', 'b');
    vi.useFakeTimers();
    render(<GalleryWidget widget={galleryWidget({ mode: 'single', interval: 5 })} />);
    await flushAsync();
    expect(shownImage()).toBe('blob:a');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(shownImage()).toBe('blob:a');
  });

  it('skips an image that fails to decode', async () => {
    mockItems.current = items('a', 'b');
    const { container } = render(<GalleryWidget widget={galleryWidget()} />);
    await waitFor(() => expect(shownImage()).toBe('blob:a'));

    const img = container.querySelector('img')!;
    img.dispatchEvent(new Event('error'));

    await waitFor(() => expect(shownImage()).toBe('blob:b'));
  });

  it('preview mode renders the wallpaper fixture with zero fetches', async () => {
    const { fetchGalleryItems } = await import('../../../api/gallery');
    const { fetchServiceBlob } = await import('../../../api/service');
    render(
      <PanelPreviewProvider value={true}>
        <GalleryWidget widget={galleryWidget()} />
      </PanelPreviewProvider>,
    );

    expect(shownImage()?.startsWith('data:image/svg+xml')).toBe(true);
    expect(vi.mocked(fetchGalleryItems)).not.toHaveBeenCalled();
    expect(vi.mocked(fetchServiceBlob)).not.toHaveBeenCalled();
  });

  it('tiles fill by default (cover); the fit setting letterboxes', async () => {
    mockItems.current = items('a');
    const { unmount } = render(<GalleryWidget widget={galleryWidget()} />);
    await waitFor(() => expect(shownImage()).toBe('blob:a'));
    expect(document.querySelector('img')!.getAttribute('data-fit')).toBe('cover');
    unmount();

    render(<GalleryWidget widget={galleryWidget({ fit: true })} />);
    await waitFor(() => expect(shownImage()).toBe('blob:a'));
    expect(document.querySelector('img')!.getAttribute('data-fit')).toBe('contain');
  });

  it('immersive always letterboxes, even with fit off', async () => {
    mockItems.current = items('a');
    render(<GalleryWidget widget={galleryWidget({ fit: false })} immersive />);

    await waitFor(() => expect(shownImage()).toBe('blob:a'));
    expect(document.querySelector('img')!.getAttribute('data-fit')).toBe('contain');
  });

  describe('videos', () => {
    it('plays a clip from the direct token URL, muted and looping in single mode', async () => {
      mockItems.current = [video('v1')];
      render(<GalleryWidget widget={galleryWidget({ mode: 'single' })} />);

      await waitFor(() => expect(shownVideo()).not.toBeNull());
      const el = shownVideo()!;
      expect(el.getAttribute('src')).toBe('http://svc/gallery/items/v1/file?token=t');
      expect(el.muted).toBe(true);
      expect(el.loop).toBe(true);
      // The poster is the ?w= still, loaded like any image; the element
      // itself is not held back waiting for it.
      await waitFor(() => expect(el.getAttribute('poster')).toBe('blob:v1'));
      expect(document.querySelector('img')).toBeNull();
    });

    it('still renders a clip whose poster the service could not make', async () => {
      mockItems.current = [video('v1')];
      mockItems.noPoster.add('v1');
      render(<GalleryWidget widget={galleryWidget()} />);

      await waitFor(() => expect(shownVideo()).not.toBeNull());
      expect(shownVideo()!.getAttribute('poster')).toBeNull();
    });

    it('the media setting narrows the view to images or to videos', async () => {
      mockItems.current = [...items('a'), video('v1'), ...items('b')];
      const { unmount } = render(<GalleryWidget widget={galleryWidget({ media: 'videos' })} />);
      await waitFor(() => expect(shownVideo()).not.toBeNull());
      // One video → no arrows: the images do not count.
      expect(screen.queryByLabelText('Next')).toBeNull();
      unmount();

      render(<GalleryWidget widget={galleryWidget({ media: 'images' })} />);
      await waitFor(() => expect(shownImage()).toBe('blob:a'));
      fireEvent.click(screen.getByLabelText('Next'));
      await waitFor(() => expect(shownImage()).toBe('blob:b'));
      expect(shownVideo()).toBeNull();
    });

    it('says which kind is missing when the filter leaves nothing', async () => {
      mockItems.current = items('a', 'b');
      const { unmount } = render(<GalleryWidget widget={galleryWidget({ media: 'videos' })} />);
      expect(await screen.findByText('No videos in the gallery')).toBeTruthy();
      expect(screen.queryByText('Add images or videos on the Gallery page')).toBeNull();
      unmount();

      mockItems.current = [video('v1')];
      render(<GalleryWidget widget={galleryWidget({ media: 'images' })} />);
      expect(await screen.findByText('No images in the gallery')).toBeTruthy();
    });

    // 3s clip on a 10s interval: 3 plays are 9s, short of the interval, so a
    // fourth runs; the switch comes at its end (12s), not at the tick.
    it('a clip shorter than the interval repeats until the interval has passed', async () => {
      mockItems.current = [video('v1'), ...items('b')];
      vi.useFakeTimers();
      render(<GalleryWidget widget={galleryWidget({ mode: 'slideshow', interval: 10 })} />);
      await flushAsync();
      const el = shownVideo()!;
      expect(el.loop).toBe(false);

      // The tick never fires while the clip is pacing.
      await act(async () => { await vi.advanceTimersByTimeAsync(10_500); });
      expect(shownVideo()).toBe(el);

      for (let play = 1; play <= 3; play++) {
        await act(async () => { endVideo(3); });
        await flushAsync();
        expect(shownVideo()).toBe(el);
        expect(vi.mocked(HTMLMediaElement.prototype.play)).toHaveBeenCalledTimes(play + 1);
      }

      await act(async () => { endVideo(3); });
      await flushAsync();
      expect(shownImage()).toBe('blob:b');
    });

    it('a clip longer than the interval plays once through', async () => {
      mockItems.current = [video('v1'), ...items('b')];
      vi.useFakeTimers();
      render(<GalleryWidget widget={galleryWidget({ mode: 'slideshow', interval: 5 })} />);
      await flushAsync();
      setDuration(20);

      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(shownVideo()).not.toBeNull();

      await act(async () => { endVideo(20); });
      await flushAsync();
      expect(shownImage()).toBe('blob:b');
    });

    it('an image after a clip gets its full interval', async () => {
      mockItems.current = [video('v1'), ...items('b')];
      vi.useFakeTimers();
      render(<GalleryWidget widget={galleryWidget({ mode: 'slideshow', interval: 5 })} />);
      await flushAsync();
      await act(async () => { endVideo(20); });
      await flushAsync();
      expect(shownImage()).toBe('blob:b');

      await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
      expect(shownImage()).toBe('blob:b');
      await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
      expect(shownVideo()).not.toBeNull();
    });

    it('with play-to-end off, a clip loops and the tick cuts it', async () => {
      mockItems.current = [video('v1'), ...items('b')];
      vi.useFakeTimers();
      render(<GalleryWidget widget={galleryWidget({ mode: 'slideshow', interval: 5, finishVideos: false })} />);
      await flushAsync();
      expect(shownVideo()!.loop).toBe(true);

      await act(async () => { await vi.advanceTimersByTimeAsync(5_100); });
      expect(shownImage()).toBe('blob:b');
    });

    // A stalled clip fires neither ended nor error; with the tick off, the
    // ceiling is the only thing that moves the slideshow on. It is measured
    // against the clip's own length, so a long clip is not cut short.
    it('moves on from a paced clip that stalls, but not before it could have finished', async () => {
      mockItems.current = [video('v1'), ...items('b')];
      vi.useFakeTimers();
      render(<GalleryWidget widget={galleryWidget({ mode: 'slideshow', interval: 5 })} />);
      await flushAsync();
      setDuration(60);

      // 2 x 60s + grace: still the clip well past its length and the interval.
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(shownVideo()).not.toBeNull();

      await act(async () => { await vi.advanceTimersByTimeAsync(16_000); });
      await flushAsync();
      expect(shownImage()).toBe('blob:b');
    });

    it('a clip that never reports metadata is given up on after the grace period', async () => {
      mockItems.current = [video('v1'), ...items('b')];
      vi.useFakeTimers();
      render(<GalleryWidget widget={galleryWidget({ mode: 'slideshow', interval: 5 })} />);
      await flushAsync();

      await act(async () => { await vi.advanceTimersByTimeAsync(16_000); });
      await flushAsync();
      expect(shownImage()).toBe('blob:b');
    });

    it('skips a clip the WebView cannot play', async () => {
      mockItems.current = [video('v1'), ...items('b')];
      render(<GalleryWidget widget={galleryWidget()} />);
      await waitFor(() => expect(shownVideo()).not.toBeNull());

      shownVideo()!.dispatchEvent(new Event('error'));

      await waitFor(() => expect(shownImage()).toBe('blob:b'));
    });
  });

  it('a second instance with the same widget id opens on the photo the first showed', async () => {
    mockItems.current = items('a', 'b', 'c');
    const shared = galleryWidget(undefined, 'gallery-shared');
    const { unmount } = render(<GalleryWidget widget={shared} />);
    await waitFor(() => expect(shownImage()).toBe('blob:a'));
    fireEvent.click(screen.getByLabelText('Next'));
    await waitFor(() => expect(shownImage()).toBe('blob:b'));
    unmount();

    // Same instance id (the immersive view of the same tile).
    render(<GalleryWidget widget={{ ...shared }} immersive />);
    await waitFor(() => expect(shownImage()).toBe('blob:b'));
  });
});
