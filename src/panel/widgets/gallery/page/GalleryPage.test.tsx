import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryPage } from './GalleryPage';

const mockState = vi.hoisted(() => ({
  sources: [] as { id: string; kind: string; path: string; name: string; addedAtUnixMs: number; excluded: string[] }[],
  items: [] as { id: string; name: string; sourceId: string; kind?: 'image' | 'video' }[],
  playlists: [] as { id: string; name: string; createdAtUnixMs: number; sourceIds: string[]; itemIds: string[]; excludedIds: string[] }[],
  uses: [] as { surface: 'dashboard' | 'panel' | 'desktop'; name: string; count: number }[] | null,
  bridgeAvailable: false,
}));

vi.mock('../../../../api/gallery', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/gallery')>()),
  GALLERY_ERROR_DUPLICATE: 'duplicate',
  fetchGallerySources: vi.fn(() => Promise.resolve({ sources: mockState.sources })),
  fetchGalleryItems: vi.fn(() => Promise.resolve({ items: mockState.items, playlists: mockState.playlists })),
  createGalleryPlaylist: vi.fn((name: string) => {
    const playlist = { id: 'pl-new', name, createdAtUnixMs: 1, sourceIds: [], itemIds: [], excludedIds: [] };
    mockState.playlists = [...mockState.playlists, playlist];
    return Promise.resolve({ playlist });
  }),
  // Stores what it is given, as the service would, so the refetch after a
  // save reads the saved state back.
  updateGalleryPlaylist: vi.fn((id: string, patch: object) => {
    mockState.playlists = mockState.playlists.map(p => (p.id === id ? { ...p, ...patch } : p));
    return Promise.resolve({ playlist: mockState.playlists.find(p => p.id === id) ?? null });
  }),
  deleteGalleryPlaylist: vi.fn(() => Promise.resolve(true)),
  fetchGalleryPlaylistUsage: vi.fn(() => Promise.resolve(mockState.uses)),
  addGallerySource: vi.fn(() => Promise.resolve({ source: null })),
  deleteGallerySource: vi.fn(() => Promise.resolve(true)),
  excludeGalleryItem: vi.fn(() => Promise.resolve(true)),
  restoreGalleryExclusions: vi.fn(() => Promise.resolve(true)),
  pickGalleryPaths: vi.fn(() => Promise.resolve({ paths: ['/home/user/Pictures'] })),
}));

vi.mock('../../../../api/service', () => ({
  fetchServiceBlob: vi.fn(() => Promise.resolve(null)),
  isRelayActive: vi.fn(() => false),
  isDirectActive: vi.fn(() => false),
}));

vi.mock('../../../../app/windowActions', () => ({
  postGalleryDrop: vi.fn(() => mockState.bridgeAvailable),
  subscribeGalleryDropPaths: vi.fn(() => () => {}),
}));

vi.mock('../../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
}));

vi.mock('../../../../lib/i18n', () => {
  // Single stable t - the real hook's t is reference-stable; a fresh function
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
  mockState.playlists = [];
  mockState.uses = [];
  mockState.bridgeAvailable = false;
  vi.clearAllMocks();
});

describe('GalleryPage', () => {
  it('shows the feature intro when there are no sources', async () => {
    render(<GalleryPage />);

    expect(await screen.findByText('gallery.intro.title')).toBeTruthy();
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

  it('marks clips in the grid', async () => {
    mockState.sources = [folderSource('Pictures'), fileSource('solo')];
    mockState.items = [
      { id: 'i1', name: 'a.png', sourceId: 'Pictures', kind: 'image' },
      { id: 'i2', name: 'b.mp4', sourceId: 'Pictures', kind: 'video' },
      { id: 'i3', name: 'solo.mp4', sourceId: 'solo', kind: 'video' },
    ];
    render(<GalleryPage />);
    await screen.findByText('Pictures');

    // One badge per clip, none on the image.
    expect(screen.getAllByLabelText('gallery.page.video')).toHaveLength(2);
  });

  it('names a tile through the in-house tooltip, not the native title', async () => {
    mockState.sources = [folderSource('Pictures')];
    mockState.items = [
      { id: 'i1', name: 'a-very-long-photo-name.png', sourceId: 'Pictures', kind: 'image' },
      { id: 'i2', name: 'b.mp4', sourceId: 'Pictures', kind: 'video' },
    ];
    const { container } = render(<GalleryPage />);
    await screen.findByText('Pictures');

    expect(container.querySelectorAll('[title]')).toHaveLength(0);
    const tiles = container.querySelectorAll('figure');
    // Focus opens the shared tooltip without the pointer-rest delay.
    fireEvent.focus(tiles[1]);
    // Clip tooltip carries the kind as its title line above the file name.
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('gallery.page.video');
    expect(tip.textContent).toContain('b.mp4');
  });

  it('add-folder opens the native picker and adds the chosen path', async () => {
    const { addGallerySource, pickGalleryPaths } = await import('../../../../api/gallery');
    render(<GalleryPage />);
    await screen.findByText('gallery.intro.title');

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

  it('adding an already-present source says so instead of a generic failure', async () => {
    const { addGallerySource, pickGalleryPaths } = await import('../../../../api/gallery');
    vi.mocked(pickGalleryPaths).mockResolvedValueOnce({ paths: ['/home/user/Pictures'] });
    vi.mocked(addGallerySource).mockResolvedValueOnce({ source: null, error: true, code: 'duplicate' });
    render(<GalleryPage />);
    await screen.findByText('gallery.intro.title');

    fireEvent.click(screen.getByText('gallery.page.addFolder'));

    expect(await screen.findByText('gallery.page.alreadyAdded:name=Pictures')).toBeTruthy();
    expect(screen.queryByText(/gallery\.page\.addFailed/)).toBeNull();
  });

  it('a cancelled native dialog adds nothing and shows no error', async () => {
    const { addGallerySource, pickGalleryPaths } = await import('../../../../api/gallery');
    vi.mocked(pickGalleryPaths).mockResolvedValueOnce({ paths: [], cancelled: true });
    render(<GalleryPage />);
    await screen.findByText('gallery.intro.title');

    fireEvent.click(screen.getByText('gallery.page.addFile'));
    await waitFor(() => expect(vi.mocked(pickGalleryPaths)).toHaveBeenCalled());

    expect(vi.mocked(addGallerySource)).not.toHaveBeenCalled();
    expect(screen.queryByText('gallery.page.pickFailed')).toBeNull();
  });

  it('a failed native dialog surfaces the error line', async () => {
    const { pickGalleryPaths } = await import('../../../../api/gallery');
    vi.mocked(pickGalleryPaths).mockResolvedValueOnce({ paths: [], error: true, msg: '' });
    render(<GalleryPage />);
    await screen.findByText('gallery.intro.title');

    fireEvent.click(screen.getByText('gallery.page.addFile'));

    expect(await screen.findByText('gallery.page.pickFailed')).toBeTruthy();
  });

  it('a drop without the shell bridge shows the desktop-app hint', async () => {
    render(<GalleryPage />);
    await screen.findByText('gallery.intro.title');

    const drop = document.querySelector('[class*=dropZone]')!;
    fireEvent.drop(drop, { dataTransfer: { files: [new File(['x'], 'a.png')] } });

    expect(await screen.findByText('gallery.page.dropNeedsApp')).toBeTruthy();
  });

  it('a drop with the shell bridge hands the files over and shows no error', async () => {
    const { postGalleryDrop } = await import('../../../../app/windowActions');
    mockState.bridgeAvailable = true;
    render(<GalleryPage />);
    await screen.findByText('gallery.intro.title');

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

  describe('playlists', () => {
    const playlist = (id: string, name: string, patch: { sourceIds?: string[]; itemIds?: string[]; excludedIds?: string[] } = {}) => ({
      id, name, createdAtUnixMs: 1, sourceIds: [], itemIds: [], excludedIds: [], ...patch,
    });

    beforeEach(() => {
      mockState.sources = [folderSource('Pictures'), fileSource('solo')];
      mockState.items = [
        { id: 'i1', name: 'a.png', sourceId: 'Pictures' },
        { id: 'i2', name: 'b.png', sourceId: 'Pictures' },
        { id: 'i3', name: 'solo.png', sourceId: 'solo' },
      ];
    });

    it('opens on All media, the library itself, with the remove buttons', async () => {
      mockState.playlists = [playlist('pl-1', 'Desk')];
      render(<GalleryPage />);
      await screen.findByText('Desk');

      expect(screen.getByRole('button', { name: /gallery\.playlist\.all/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByLabelText('gallery.page.removeImage')).toHaveLength(3);
      expect(screen.queryByLabelText('gallery.page.addToPlaylist')).toBeNull();
    });

    it('creates a playlist through the name prompt and opens it on the library', async () => {
      const { createGalleryPlaylist } = await import('../../../../api/gallery');
      render(<GalleryPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'gallery.page.newPlaylist' }));
      fireEvent.change(screen.getByPlaceholderText('gallery.page.playlistName'), { target: { value: 'Desk' } });
      fireEvent.click(screen.getByRole('button', { name: 'gallery.page.create' }));

      await waitFor(() => expect(createGalleryPlaylist).toHaveBeenCalledWith('Desk'));
      // Empty, so every library item is on offer to add.
      await waitFor(() => expect(screen.getAllByLabelText('gallery.page.addToPlaylist')).toHaveLength(3));
    });

    it('shows a taken name as the prompt error and keeps it open', async () => {
      const { createGalleryPlaylist } = await import('../../../../api/gallery');
      vi.mocked(createGalleryPlaylist).mockResolvedValueOnce({ playlist: null, error: true, code: 'duplicate' });
      render(<GalleryPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'gallery.page.newPlaylist' }));
      fireEvent.change(screen.getByPlaceholderText('gallery.page.playlistName'), { target: { value: 'Desk' } });
      fireEvent.click(screen.getByRole('button', { name: 'gallery.page.create' }));

      expect(await screen.findByText('gallery.page.playlistNameTaken')).toBeTruthy();
    });

    it('a click on a tile switches that item in or out', async () => {
      const { updateGalleryPlaylist } = await import('../../../../api/gallery');
      mockState.playlists = [playlist('pl-1', 'Desk', { itemIds: ['i3'] })];
      render(<GalleryPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Desk/ }));

      // Opens on its members; switch to the whole library to pick more.
      expect(screen.getAllByRole('button', { pressed: true, name: 'gallery.page.removeFromPlaylist' })).toHaveLength(1);
      fireEvent.click(screen.getByRole('radio', { name: 'gallery.playlist.all' }));
      fireEvent.click(screen.getAllByLabelText('gallery.page.addToPlaylist')[0]);

      await waitFor(() => expect(updateGalleryPlaylist).toHaveBeenCalledWith('pl-1', {
        sourceIds: [], itemIds: ['i3', 'i1'], excludedIds: [],
      }));
      expect(screen.getAllByLabelText('gallery.page.removeFromPlaylist')).toHaveLength(2);
    });

    it('whole folder puts the folder in, and a click then leaves one of its items out', async () => {
      const { updateGalleryPlaylist } = await import('../../../../api/gallery');
      mockState.playlists = [playlist('pl-1', 'Desk')];
      render(<GalleryPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Desk/ }));

      // Only the folder source offers it; a single file is one tile click.
      const wholeFolder = screen.getAllByRole('switch', { name: 'gallery.page.wholeFolder' });
      expect(wholeFolder).toHaveLength(1);
      fireEvent.click(wholeFolder[0]);
      await waitFor(() => expect(updateGalleryPlaylist).toHaveBeenLastCalledWith('pl-1', {
        sourceIds: ['Pictures'], itemIds: [], excludedIds: [],
      }));
      expect(screen.getByText('gallery.page.inPlaylistCount:count=2:total=2')).toBeTruthy();

      fireEvent.click(screen.getAllByLabelText('gallery.page.removeFromPlaylist')[0]);
      await waitFor(() => expect(updateGalleryPlaylist).toHaveBeenLastCalledWith('pl-1', {
        sourceIds: ['Pictures'], itemIds: [], excludedIds: ['i1'],
      }));
    });

    it('a single-file source gets an on/off switch that toggles its one item', async () => {
      const { updateGalleryPlaylist } = await import('../../../../api/gallery');
      mockState.playlists = [playlist('pl-1', 'Desk')];
      render(<GalleryPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Desk/ }));

      const inPlaylist = screen.getByRole('switch', { name: 'gallery.page.inPlaylistToggle' });
      expect(inPlaylist).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(inPlaylist);
      await waitFor(() => expect(updateGalleryPlaylist).toHaveBeenLastCalledWith('pl-1', {
        sourceIds: [], itemIds: ['i3'], excludedIds: [],
      }));
      expect(screen.getByRole('switch', { name: 'gallery.page.inPlaylistToggle' })).toHaveAttribute('aria-checked', 'true');
    });

    it('deleting the open playlist returns to All media', async () => {
      const { deleteGalleryPlaylist } = await import('../../../../api/gallery');
      mockState.playlists = [playlist('pl-1', 'Desk', { itemIds: ['i1'] })];
      render(<GalleryPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Desk/ }));
      fireEvent.click(screen.getByLabelText('gallery.page.deletePlaylist'));
      mockState.playlists = [];
      // The dialog opens once the usage lookup has answered.
      fireEvent.click(await screen.findByRole('button', { name: 'common.delete' }));

      await waitFor(() => expect(deleteGalleryPlaylist).toHaveBeenCalledWith('pl-1'));
      await waitFor(() => expect(screen.getAllByLabelText('gallery.page.removeImage')).toHaveLength(3));
    });

    it('a delete waits behind queued membership saves', async () => {
      const { deleteGalleryPlaylist, updateGalleryPlaylist } = await import('../../../../api/gallery');
      mockState.playlists = [playlist('pl-1', 'Desk', { itemIds: ['i1'] })];
      render(<GalleryPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Desk/ }));
      fireEvent.click(screen.getAllByLabelText('gallery.page.removeFromPlaylist')[0]);
      fireEvent.click(screen.getByLabelText('gallery.page.deletePlaylist'));
      fireEvent.click(await screen.findByRole('button', { name: 'common.delete' }));

      await waitFor(() => expect(deleteGalleryPlaylist).toHaveBeenCalledWith('pl-1'));
      expect(vi.mocked(updateGalleryPlaylist).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(deleteGalleryPlaylist).mock.invocationCallOrder[0]);
      expect(screen.queryByText('gallery.page.playlistSaveFailed')).toBeNull();
    });

    it('names every widget still playing the playlist before it is deleted', async () => {
      const { deleteGalleryPlaylist } = await import('../../../../api/gallery');
      mockState.playlists = [playlist('pl-1', 'Desk', { itemIds: ['i1'] })];
      mockState.uses = [
        { surface: 'dashboard', name: '', count: 2 },
        { surface: 'panel', name: 'Y70 Touch', count: 1 },
        { surface: 'desktop', name: '', count: 1 },
      ];
      render(<GalleryPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Desk/ }));
      fireEvent.click(screen.getByLabelText('gallery.page.deletePlaylist'));

      expect(await screen.findByText('gallery.page.deletePlaylistInUse:name=Desk')).toBeTruthy();
      expect(screen.getByText('gallery.page.usage.count.other:name=gallery.page.usage.dashboard:count=2')).toBeTruthy();
      expect(screen.getByText('Y70 Touch')).toBeTruthy();
      expect(screen.getByText('gallery.page.usage.desktop')).toBeTruthy();
      // Nothing is deleted until the user confirms.
      expect(deleteGalleryPlaylist).not.toHaveBeenCalled();
    });

    it('says nothing plays an unused playlist, and stays neutral when the lookup fails', async () => {
      mockState.playlists = [playlist('pl-1', 'Desk', { itemIds: ['i1'] })];
      render(<GalleryPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Desk/ }));
      fireEvent.click(screen.getByLabelText('gallery.page.deletePlaylist'));
      expect(await screen.findByText('gallery.page.deletePlaylistUnused')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));

      mockState.uses = null;
      fireEvent.click(screen.getByLabelText('gallery.page.deletePlaylist'));
      expect(await screen.findByText('gallery.page.deletePlaylistNote')).toBeTruthy();
      expect(screen.getByText('gallery.page.deletePlaylistMessage:name=Desk')).toBeTruthy();
    });
  });
});
