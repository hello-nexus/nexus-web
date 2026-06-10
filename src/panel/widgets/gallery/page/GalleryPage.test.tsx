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
  browseGallery: vi.fn(() => Promise.resolve({
    path: '',
    parent: null,
    dirs: [{ name: 'Pictures', path: '/home/user/Pictures' }],
    files: [],
  })),
  importGalleryImage: vi.fn(() => Promise.resolve({ source: null })),
  galleryItemThumbUrl: (id: string) => `/gallery/items/${id}/thumbnail`,
}));

vi.mock('../../../../api/service', () => ({
  fetchServiceBlob: vi.fn(() => Promise.resolve(null)),
  isRelayActive: vi.fn(() => false),
}));

vi.mock('../../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
}));

vi.mock('../../../../lib/i18n', () => {
  // Single stable t — FileBrowserDialog keeps it in effect deps; a fresh
  // function per render would loop the browse effect forever.
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

  it('opens the browse dialog and adds the chosen folder', async () => {
    const { addGallerySource, browseGallery } = await import('../../../../api/gallery');
    render(<GalleryPage />);
    await screen.findByText('gallery.page.noSources');

    fireEvent.click(screen.getByText('gallery.page.addFolder'));
    await waitFor(() => expect(vi.mocked(browseGallery)).toHaveBeenCalled());

    // Navigate into a directory, then confirm it.
    vi.mocked(browseGallery).mockResolvedValueOnce({
      path: '/home/user/Pictures',
      parent: '/home/user',
      dirs: [],
      files: [],
    });
    fireEvent.click(await screen.findByText('Pictures'));
    const confirm = await screen.findByText('gallery.browse.useFolder');
    await waitFor(() => expect((confirm.closest('button') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(vi.mocked(addGallerySource)).toHaveBeenCalledWith('/home/user/Pictures', 'folder'));
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
