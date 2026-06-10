import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { GalleryWidget } from './GalleryWidget';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';

const mockItems = vi.hoisted(() => ({
  current: [] as { id: string; name: string; sourceId: string }[],
}));

vi.mock('../../../api/gallery', () => ({
  fetchGalleryItems: vi.fn(() => Promise.resolve({ items: mockItems.current })),
  galleryItemFileUrl: (id: string) => `/gallery/items/${id}/file`,
}));

vi.mock('../../../api/service', () => ({
  // Tag each blob with the item id so createObjectURL can mint a
  // distinguishable URL — lets assertions check WHICH image is shown.
  fetchServiceBlob: vi.fn((path: string) => {
    const id = /\/gallery\/items\/(.+)\/file/.exec(path)?.[1] ?? 'unknown';
    const blob = new Blob(['img']) as Blob & { tag?: string };
    blob.tag = id;
    return Promise.resolve(blob);
  }),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => {
  // Single stable t — components may put it in effect deps.
  const t = (key: string) => ({
    'gallery.empty.title': 'No images',
    'gallery.empty.text': 'Add images on the Gallery page',
    'gallery.panel.prev': 'Previous image',
    'gallery.panel.next': 'Next image',
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
  return ids.map(id => ({ id, name: `${id}.png`, sourceId: 'src-1' }));
}

function shownImage(): string | null {
  return document.querySelector('img')?.getAttribute('src') ?? null;
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
  globalThis.URL.createObjectURL = vi.fn((blob: Blob & { tag?: string }) => `blob:${blob.tag ?? 'x'}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GalleryWidget', () => {
  it('renders the standard empty state when there are no images', async () => {
    render(<GalleryWidget widget={galleryWidget()} />);

    expect(await screen.findByText('No images')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows a single image without arrows', async () => {
    mockItems.current = items('a');
    render(<GalleryWidget widget={galleryWidget()} />);

    await waitFor(() => expect(shownImage()).toBe('blob:a'));
    expect(screen.queryByLabelText('Previous image')).toBeNull();
    expect(screen.queryByLabelText('Next image')).toBeNull();
  });

  it('navigates with arrows, revealing them and fading after idle', async () => {
    mockItems.current = items('a', 'b', 'c');
    const { container } = render(<GalleryWidget widget={galleryWidget()} />);
    await waitFor(() => expect(shownImage()).toBe('blob:a'));

    const viewer = container.firstElementChild as HTMLElement;
    expect(viewer.getAttribute('data-arrows-visible')).toBe('false');

    fireEvent.click(screen.getByLabelText('Next image'));
    await waitFor(() => expect(shownImage()).toBe('blob:b'));
    expect(viewer.getAttribute('data-arrows-visible')).toBe('true');

    // Wrap-around going backwards from index 1 → 0 → prev again lands on c.
    fireEvent.click(screen.getByLabelText('Previous image'));
    await waitFor(() => expect(shownImage()).toBe('blob:a'));
    fireEvent.click(screen.getByLabelText('Previous image'));
    await waitFor(() => expect(shownImage()).toBe('blob:c'));
  });

  it('arrows fade out after the idle delay', async () => {
    mockItems.current = items('a', 'b');
    vi.useFakeTimers();
    const { container } = render(<GalleryWidget widget={galleryWidget()} />);
    await flushAsync();
    expect(shownImage()).toBe('blob:a');

    const viewer = container.firstElementChild as HTMLElement;
    fireEvent.click(screen.getByLabelText('Next image'));
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

  it('a second instance with the same widget id opens on the photo the first showed', async () => {
    mockItems.current = items('a', 'b', 'c');
    const shared = galleryWidget(undefined, 'gallery-shared');
    const { unmount } = render(<GalleryWidget widget={shared} />);
    await waitFor(() => expect(shownImage()).toBe('blob:a'));
    fireEvent.click(screen.getByLabelText('Next image'));
    await waitFor(() => expect(shownImage()).toBe('blob:b'));
    unmount();

    // Same instance id (the immersive view of the same tile).
    render(<GalleryWidget widget={{ ...shared }} immersive />);
    await waitFor(() => expect(shownImage()).toBe('blob:b'));
  });
});
