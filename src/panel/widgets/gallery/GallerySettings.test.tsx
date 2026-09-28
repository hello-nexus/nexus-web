import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { GallerySettings } from './GallerySettings';

const mockState = vi.hoisted(() => ({
  playlists: [] as { id: string; name: string; createdAtUnixMs: number; sourceIds: string[]; itemIds: string[]; excludedIds: string[] }[],
}));

vi.mock('../../../api/gallery', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/gallery')>()),
  fetchGalleryItems: vi.fn(() => Promise.resolve({
    items: [{ id: 'a', name: 'a.png', sourceId: 'src', kind: 'image' }],
    playlists: mockState.playlists,
  })),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t, language: 'en' }) };
});

// A native <select> so the options can be read and driven directly.
vi.mock('../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel }: {
    value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; ariaLabel?: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

function galleryWidget(config?: PanelWidget['config']): PanelWidget {
  return { id: 'gallery-1', type: 'gallery', size: '4x4', col: 0, row: 0, config };
}

const playlist = (id: string, name: string) => ({
  id, name, createdAtUnixMs: 1, sourceIds: [], itemIds: [], excludedIds: [],
});

beforeEach(() => {
  mockState.playlists = [];
});

describe('GallerySettings playlist picker', () => {
  it('stays hidden until a playlist exists', async () => {
    render(<GallerySettings widget={galleryWidget()} onUpdate={vi.fn()} onResize={vi.fn()} />);
    // The media select renders either way; wait for the fetch to settle.
    await screen.findByLabelText('gallery.settings.media');
    await waitFor(() => expect(screen.queryByLabelText('gallery.settings.playlist')).toBeNull());
  });

  it('offers All media first, then each playlist, and writes the pick', async () => {
    mockState.playlists = [playlist('pl-1', 'Desk'), playlist('pl-2', 'Wall')];
    const onUpdate = vi.fn();
    render(<GallerySettings widget={galleryWidget({ imageId: 'a' })} onUpdate={onUpdate} onResize={vi.fn()} />);

    const select = await screen.findByLabelText('gallery.settings.playlist') as HTMLSelectElement;
    expect(Array.from(select.options).map(o => o.textContent)).toEqual(['gallery.playlist.all', 'Desk', 'Wall']);
    expect(select.value).toBe('');

    fireEvent.change(select, { target: { value: 'pl-2' } });
    expect(onUpdate).toHaveBeenCalledWith({ playlistId: 'pl-2', imageId: null });

    fireEvent.change(select, { target: { value: '' } });
    expect(onUpdate).toHaveBeenLastCalledWith({ playlistId: null, imageId: null });
  });

  it('shows a deleted playlist as All media', async () => {
    mockState.playlists = [playlist('pl-1', 'Desk')];
    render(<GallerySettings widget={galleryWidget({ playlistId: 'gone' })} onUpdate={vi.fn()} onResize={vi.fn()} />);
    const select = await screen.findByLabelText('gallery.settings.playlist') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('links to the gallery page where the host can navigate, and explains where it cannot', async () => {
    const onSectionNavigate = vi.fn();
    const { unmount } = render(
      <GallerySettings widget={galleryWidget()} onUpdate={vi.fn()} onResize={vi.fn()} onSectionNavigate={onSectionNavigate} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'gallery.manage' }));
    expect(onSectionNavigate).toHaveBeenCalledWith('gallery');
    expect(screen.queryByText('gallery.settings.manageHint')).toBeNull();
    unmount();

    render(<GallerySettings widget={galleryWidget()} onUpdate={vi.fn()} onResize={vi.fn()} />);
    expect(await screen.findByText('gallery.settings.manageHint')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'gallery.manage' })).toBeNull();
  });
});
