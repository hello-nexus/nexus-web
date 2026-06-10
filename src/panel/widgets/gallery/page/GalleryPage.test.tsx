import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryPage } from './GalleryPage';

const mockState = vi.hoisted(() => ({
  sources: [] as { id: string; kind: string; path: string; name: string; addedAtUnixMs: number; excluded: string[] }[],
  items: [] as { id: string; name: string; sourceId: string }[],
  bridgeAvailable: false,
}));

vi.mock('../../../../api/gallery', () => ({
  fetchGallerySources: vi.fn(() => Promise.resolve({ sources: mockState.sources })),
  fetchGalleryItems: vi.fn(() => Promise.resolve({ items: mockState.items })),
  addGallerySource: vi.fn(() => Promise.resolve({ source: null })),
  deleteGallerySource: vi.fn(() => Promise.resolve(true)),
  excludeGalleryItem: vi.fn(() => Promise.resolve(true)),
  restoreGalleryExclusions: vi.fn(() => Promise.resolve(true)),
  pickGalleryPaths: vi.fn(() => Promise.resolve({ paths: ['/home/user/Pictures'] })),
  galleryItemFileUrl: (id: string) => `/gallery/items/${id}/file`,
}));

vi.mock('../../../../api/service', () => ({
  fetchServiceBlob: vi.fn(() => Promise.resolve(null)),
  isRelayActive: vi.fn(() => false),
}));

vi.mock('../../../../app/windowActions', () => ({
  postGalleryDrop: vi.fn(() => mockState.bridgeAvailable),
  subscribeGalleryDropPaths: vi.fn(() => () => {}),
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

function folderSource(id: string, excluded: string[] = []) {
  return { id, kind: 'folder', path: `/home/user/${id}`, name: id, addedAtUnixMs: 1, excluded };
}

function fileSource(id: string) {
  return { id, kind: 'file', path: `/home/user/${id}.png`, name: `${id}.png`, addedAtUnixMs: 1, excluded: [] };
}

beforeEach(() => {
  mockState.sources = [];
  mockState.items = [];
  mockState.bridgeAvailable = false;
  vi.clearAllMocks();
});

describe('GalleryPage', () => {
  it('shows the no-sources empty state', async () => {
    render(<GalleryPage />);

    expect(await screen.findByText('gallery.page.noSources')).toBeTruthy();
  });

  it('lists sources with derived item counts', async () => {
    mockState.sources = [folderSource('Pictures'), fileSource('solo')];
    mockState.items = [
      { id: 'i1', name: 'a.png', sourceId: 'Pictures' },
      { id: 'i2', name: 'b.png', sourceId: 'Pictures' },
      { id: 'i3', name: 'solo.png', sourceId: 'solo' },
    ];
    render(<GalleryPage />);

    expect(await screen.findByText('Pictures')).toBeTruthy();
    expect(screen.getByText('/home/user/Pictures')).toBeTruthy();
    expect(screen.getByText('gallery.page.itemCount:count=2')).toBeTruthy();
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

  it('removing a folder image excludes it; a file-source image drops the source', async () => {
    const { deleteGallerySource, excludeGalleryItem } = await import('../../../../api/gallery');
    mockState.sources = [folderSource('Pictures'), fileSource('solo')];
    mockState.items = [
      { id: 'i1', name: 'a.png', sourceId: 'Pictures' },
      { id: 'i3', name: 'solo.png', sourceId: 'solo' },
    ];
    render(<GalleryPage />);
    await screen.findByText('Pictures');

    const removeButtons = screen.getAllByLabelText('gallery.page.removeImage');
    fireEvent.click(removeButtons[0]);
    await waitFor(() => expect(vi.mocked(excludeGalleryItem)).toHaveBeenCalledWith('Pictures', 'i1'));
    expect(vi.mocked(deleteGallerySource)).not.toHaveBeenCalled();

    fireEvent.click(removeButtons[1]);
    await waitFor(() => expect(vi.mocked(deleteGallerySource)).toHaveBeenCalledWith('solo'));
  });

  it('the excluded chip restores in one click', async () => {
    const { restoreGalleryExclusions } = await import('../../../../api/gallery');
    mockState.sources = [folderSource('Pictures', ['x1', 'x2'])];
    render(<GalleryPage />);

    const chip = await screen.findByText('gallery.page.excludedCount:count=2');
    fireEvent.click(chip);
    await waitFor(() => expect(vi.mocked(restoreGalleryExclusions)).toHaveBeenCalledWith('Pictures'));
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

  it('a drop without the shell bridge shows the desktop-app hint', async () => {
    render(<GalleryPage />);
    await screen.findByText('gallery.page.noSources');

    const drop = document.querySelector('[class*=dropZone]')!;
    fireEvent.drop(drop, { dataTransfer: { files: [new File(['x'], 'a.png')] } });

    expect(await screen.findByText('gallery.page.dropNeedsApp')).toBeTruthy();
  });

  it('a drop with the shell bridge hands the files over and shows no error', async () => {
    const { postGalleryDrop } = await import('../../../../app/windowActions');
    mockState.bridgeAvailable = true;
    render(<GalleryPage />);
    await screen.findByText('gallery.page.noSources');

    const drop = document.querySelector('[class*=dropZone]')!;
    fireEvent.drop(drop, { dataTransfer: { files: [new File(['x'], 'a.png')] } });

    await waitFor(() => expect(vi.mocked(postGalleryDrop)).toHaveBeenCalled());
    expect(screen.queryByText('gallery.page.dropNeedsApp')).toBeNull();
  });

  it('removing a source asks for confirmation first', async () => {
    const { deleteGallerySource } = await import('../../../../api/gallery');
    mockState.sources = [fileSource('a')];
    render(<GalleryPage />);
    await screen.findByText('a.png');

    fireEvent.click(screen.getByLabelText('gallery.page.remove'));
    expect(await screen.findByText('gallery.page.removeSourceMessage:name=a.png')).toBeTruthy();
    expect(vi.mocked(deleteGallerySource)).not.toHaveBeenCalled();

    const confirmBtn = screen.getAllByRole('button').find(b =>
      b.textContent === 'gallery.page.remove' && !b.getAttribute('aria-label'));
    fireEvent.click(confirmBtn!);
    await waitFor(() => expect(vi.mocked(deleteGallerySource)).toHaveBeenCalledWith('a'));
  });
});
