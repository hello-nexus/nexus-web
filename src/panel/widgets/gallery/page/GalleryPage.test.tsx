import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryPage } from './GalleryPage';

const mockState = vi.hoisted(() => ({
  sources: [] as { id: string; kind: string; path: string; name: string; addedAtUnixMs: number }[],
  items: [] as { id: string; name: string; sourceId: string }[],
}));

vi.mock('../../../../api/gallery', () => ({
  fetchGallerySources: vi.fn(() => Promise.resolve({ sources: mockState.sources })),
  fetchGalleryItems: vi.fn(() => Promise.resolve({ items: mockState.items })),
  addGallerySource: vi.fn(() => Promise.resolve({ source: null })),
  deleteGallerySource: vi.fn(() => Promise.resolve(true)),
  pickGalleryPaths: vi.fn(() => Promise.resolve({ paths: ['/home/user/Pictures'] })),
  importGalleryImage: vi.fn(() => Promise.resolve({ source: null })),
  galleryItemThumbUrl: (id: string) => `/gallery/items/${id}/thumbnail`,
  galleryItemFileUrl: (id: string) => `/gallery/items/${id}/file`,
}));

vi.mock('../../../../api/service', () => ({
  fetchServiceBlob: vi.fn(() => Promise.resolve(null)),
  isRelayActive: vi.fn(() => false),
}));

vi.mock('../../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
}));

vi.mock('../../../../lib/i18n', () => {
  // Single stable t — the real hook's t is reference-stable; a fresh function
  // per render would re-fire any effect that lists it as a dep.
  const t = (key: string, params?: Record<string, string | number>) => {
    let text = key;
    for (const [k, v] of Object.entries(params ?? {})) text += `:${k}=${v}`;
    return text;
  };
  return { useTranslation: () => ({ t }) };
});

beforeEach(() => {
  mockState.sources = [];
  mockState.items = [];
  vi.clearAllMocks();
});

describe('GalleryPage', () => {
  it('shows the no-sources empty state', async () => {
    render(<GalleryPage />);

    expect(await screen.findByText('gallery.page.noSources')).toBeTruthy();
  });

  it('lists sources with derived item counts', async () => {
    mockState.sources = [
      { id: 's1', kind: 'folder', path: '/home/user/Pictures', name: 'Pictures', addedAtUnixMs: 1 },
      { id: 's2', kind: 'upload', path: '/data/gallery/uploads/u1.png', name: 'photo.png', addedAtUnixMs: 2 },
    ];
    mockState.items = [
      { id: 'i1', name: 'a.png', sourceId: 's1' },
      { id: 'i2', name: 'b.png', sourceId: 's1' },
      { id: 'i3', name: 'photo.png', sourceId: 's2' },
    ];
    render(<GalleryPage />);

    expect(await screen.findByText('Pictures')).toBeTruthy();
    expect(screen.getByText('/home/user/Pictures')).toBeTruthy();
    expect(screen.getByText('gallery.page.itemCount:count=2')).toBeTruthy();
    // Upload rows show the original name, never the internal storage path.
    expect(screen.getAllByText('photo.png').length).toBeGreaterThan(0);
    expect(screen.queryByText('/data/gallery/uploads/u1.png')).toBeNull();
  });

  it('add-folder opens the native picker and adds the chosen path', async () => {
    const { addGallerySource, pickGalleryPaths } = await import('../../../../api/gallery');
    render(<GalleryPage />);
    await screen.findByText('gallery.page.noSources');

    fireEvent.click(screen.getByText('gallery.page.addFolder'));
    await waitFor(() => expect(vi.mocked(pickGalleryPaths)).toHaveBeenCalledWith(true));
    await waitFor(() =>
      expect(vi.mocked(addGallerySource)).toHaveBeenCalledWith('/home/user/Pictures', 'folder'));
  });

  it('add-files passes folder=false and adds every returned path', async () => {
    const { addGallerySource, pickGalleryPaths } = await import('../../../../api/gallery');
    vi.mocked(pickGalleryPaths).mockResolvedValueOnce({ paths: ['/p/a.png', '/p/b.png'] });
    render(<GalleryPage />);
    await screen.findByText('gallery.page.noSources');

    fireEvent.click(screen.getByText('gallery.page.addFile'));
    await waitFor(() => expect(vi.mocked(pickGalleryPaths)).toHaveBeenCalledWith(false));
    await waitFor(() => expect(vi.mocked(addGallerySource)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(addGallerySource)).toHaveBeenCalledWith('/p/a.png', 'file');
    expect(vi.mocked(addGallerySource)).toHaveBeenCalledWith('/p/b.png', 'file');
  });

  it('a cancelled native dialog adds nothing and shows no error', async () => {
    const { addGallerySource, pickGalleryPaths } = await import('../../../../api/gallery');
    vi.mocked(pickGalleryPaths).mockResolvedValueOnce({ paths: [], cancelled: true });
    render(<GalleryPage />);
    await screen.findByText('gallery.page.noSources');

    fireEvent.click(screen.getByText('gallery.page.addFile'));
    await waitFor(() => expect(vi.mocked(pickGalleryPaths)).toHaveBeenCalled());

    expect(vi.mocked(addGallerySource)).not.toHaveBeenCalled();
    expect(screen.queryByText('gallery.page.pickFailed')).toBeNull();
  });

  it('a failed native dialog surfaces the error line', async () => {
    const { pickGalleryPaths } = await import('../../../../api/gallery');
    vi.mocked(pickGalleryPaths).mockResolvedValueOnce({ paths: [], error: true, msg: '' });
    render(<GalleryPage />);
    await screen.findByText('gallery.page.noSources');

    fireEvent.click(screen.getByText('gallery.page.addFile'));

    expect(await screen.findByText('gallery.page.pickFailed')).toBeTruthy();
  });

  it('removing a source asks for confirmation first', async () => {
    const { deleteGallerySource } = await import('../../../../api/gallery');
    mockState.sources = [
      { id: 's1', kind: 'file', path: '/home/user/a.png', name: 'a.png', addedAtUnixMs: 1 },
    ];
    render(<GalleryPage />);
    await screen.findByText('a.png');

    fireEvent.click(screen.getByLabelText('gallery.page.remove'));
    expect(await screen.findByText('gallery.page.removeSourceMessage:name=a.png')).toBeTruthy();
    expect(vi.mocked(deleteGallerySource)).not.toHaveBeenCalled();

    const confirmBtn = screen.getAllByRole('button').find(b =>
      b.textContent === 'gallery.page.remove' && !b.getAttribute('aria-label'));
    fireEvent.click(confirmBtn!);
    await waitFor(() => expect(vi.mocked(deleteGallerySource)).toHaveBeenCalledWith('s1'));
  });
});
