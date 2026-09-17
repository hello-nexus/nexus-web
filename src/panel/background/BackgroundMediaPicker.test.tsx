import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundMediaPicker } from './BackgroundMediaPicker';
import type { PanelSlideshowSettings } from '../editor/PanelThemeSettings';
import type { BackgroundMediaItem } from '../../api/panelBackgroundMedia';
import { reorderMediaIds } from '../widgets/lighting/effecteditor/MediaGrid';

const api = vi.hoisted(() => ({
  // stageId -> preview pixel size; a missing entry is an unreadable preview.
  sizes: {} as Record<string, { w: number; h: number }>,
  // File names the service refuses at stage time (its 4xx {error, msg} body).
  rejected: new Set<string>(),
  // File names whose stage never gets an answer (the transport's null).
  unreachable: new Set<string>(),
  // When set, every stage waits on it: lets a test unmount mid-batch.
  gate: null as Promise<void> | null,
  refresh: vi.fn(() => Promise.resolve()),
  library: [] as BackgroundMediaItem[],
}));

vi.mock('../../api/panelBackgroundMedia', () => ({
  stageBackgroundMedia: vi.fn(async (_deviceId: string, file: File) => {
    if (api.gate) await api.gate;
    if (api.unreachable.has(file.name)) return null;
    return api.rejected.has(file.name)
      ? { error: true, msg: 'Unsupported file format' }
      : { stageId: `stage-${file.name}`, error: false, msg: '' };
  }),
  probeBackgroundMediaStageSize: vi.fn((_deviceId: string, stageId: string) => Promise.resolve(api.sizes[stageId] ?? null)),
  commitBackgroundMedia: vi.fn((_deviceId: string, stageId: string) => Promise.resolve({
    item: { id: `item-${stageId}`, name: stageId, sourceExt: '.jpg', type: 'static', width: 720, height: 1280, importedAtUnixMs: 1, durationSec: 0, alpha: false },
    error: false,
    msg: '',
  })),
  cancelBackgroundMediaStage: vi.fn(() => Promise.resolve()),
  deleteBackgroundMedia: vi.fn(() => Promise.resolve(true)),
  openBackgroundMediaFolder: vi.fn(() => Promise.resolve(true)),
  backgroundMediaStagePreviewUrl: vi.fn((_deviceId: string, stageId: string) => `/preview/${stageId}`),
  backgroundMediaThumbnailPath: vi.fn((_deviceId: string, id: string) => `/thumb/${id}`),
}));

vi.mock('../../api/klipy', () => ({
  searchKlipy: vi.fn(async () => ({ items: [{ slug: 'happy-cat', title: 'Happy cat', width: 220, height: 164 }], hasNext: false })),
  klipyThumbUrl: (slug: string) => `/api/klipy/thumb/${slug}`,
  stageKlipyBackground: vi.fn(async () => ({ stageId: 'stage-happy-cat', alpha: false, error: false, msg: '' })),
}));

vi.mock('./useBackgroundMedia', () => ({
  useBackgroundMedia: () => ({ items: api.library, thumbs: {}, refresh: api.refresh, removeLocal: vi.fn() }),
}));

vi.mock('../../lib/i18n', () => {
  const t = (key: string, params?: Record<string, string | number>) => {
    let text = key;
    for (const [k, v] of Object.entries(params ?? {})) text += `:${k}=${v}`;
    return text;
  };
  return { useTranslation: () => ({ t, language: 'en' }) };
});

import {
  cancelBackgroundMediaStage,
  commitBackgroundMedia,
  stageBackgroundMedia,
} from '../../api/panelBackgroundMedia';
import { stageKlipyBackground } from '../../api/klipy';

// Every folder file gets the cropper's default centred crop at the panel's
// aspect, so the expected crop strings below follow from these dimensions.
const ASPECT = 720 / 1280;

const SLIDESHOW_OFF: PanelSlideshowSettings = { enabled: false, interval: 30, shuffle: false, finishVideos: true };

function renderPicker(slideshow?: PanelSlideshowSettings, order?: string[]) {
  const onSelect = vi.fn();
  const onSlideshowChange = vi.fn();
  const onOrderChange = vi.fn();
  // StrictMode's dev mount/unmount/mount cycle is what the app runs under;
  // an unmount guard that never re-arms only fails there.
  const view = render(
    <StrictMode>
      <BackgroundMediaPicker
        deviceId="dev1"
        activeId={null}
        deviceAspect={ASPECT}
        deviceW={720}
        deviceH={1280}
        onSelect={onSelect}
        slideshow={slideshow}
        onSlideshowChange={onSlideshowChange}
        order={order}
        onOrderChange={order ? onOrderChange : undefined}
      />
    </StrictMode>,
  );
  return { onSelect, onSlideshowChange, onOrderChange, unmount: view.unmount };
}

const libraryItem = (id: string, importedAtUnixMs: number): BackgroundMediaItem => ({
  id, name: `${id}.jpg`, sourceExt: '.jpg', type: 'static', width: 720, height: 1280, importedAtUnixMs, durationSec: 0, alpha: false,
});

const cardLabels = () => screen.getAllByRole('button').map(el => el.getAttribute('aria-label')).filter(l => l && /^[a-z]$/.test(l));

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input not rendered');
  return input;
}

function pickFiles(files: File[]) {
  fireEvent.change(fileInput(), { target: { files } });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.library = [];
  api.sizes = {};
  api.rejected = new Set();
  api.unreachable = new Set();
  api.gate = null;
});

describe('BackgroundMediaPicker multi-file import', () => {
  it('takes several files at once, with no separate folder picker', () => {
    renderPicker();
    expect(fileInput()).toHaveAttribute('multiple');
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(screen.queryByText('lighting.controls.importFolder')).toBeNull();
  });

  // The cropper opens on the staged file; confirming it commits with the
  // whole frame, because jsdom never lays the image out. That is enough to
  // drive the queue.
  const confirmCropper = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));
  };
  const cancelCropper = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.cancel' }));
  };
  const WHOLE = '0.000000,0.000000,1.000000,1.000000';

  it('crops each supported file in turn, in name order, and selects the first', async () => {
    const { onSelect } = renderPicker();

    pickFiles([
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      new File(['x'], 'a.mp4', { type: 'video/mp4' }),
    ]);

    await waitFor(() => expect(stageBackgroundMedia).toHaveBeenCalledTimes(1));
    expect(vi.mocked(stageBackgroundMedia).mock.calls[0][1].name).toBe('a.mp4');
    await confirmCropper();
    await waitFor(() => expect(commitBackgroundMedia).toHaveBeenNthCalledWith(1, 'dev1', 'stage-a.mp4', WHOLE, 720, 1280, true, false));
    // The second file is staged only once the first is committed.
    await waitFor(() => expect(stageBackgroundMedia).toHaveBeenCalledTimes(2));
    expect(vi.mocked(stageBackgroundMedia).mock.calls[1][1].name).toBe('b.jpg');
    await confirmCropper();

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(commitBackgroundMedia).toHaveBeenCalledTimes(2);
    expect(api.refresh).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('item-stage-a.mp4', 'static', false);
    expect(screen.queryByText(/importFolderPartial|importFolderEmpty/)).toBeNull();
  });

  it('fit entire image in the cropper asks the service to letterbox', async () => {
    renderPicker();

    pickFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);
    fireEvent.click(await screen.findByLabelText('cropper.fitWhole'));
    await confirmCropper();

    await waitFor(() => expect(commitBackgroundMedia).toHaveBeenCalledWith('dev1', 'stage-a.jpg', WHOLE, 720, 1280, true, true));
  });

  it('cancelling a cropper skips that file and moves to the next', async () => {
    const { onSelect } = renderPicker();

    pickFiles([
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await cancelCropper();
    await waitFor(() => expect(stageBackgroundMedia).toHaveBeenCalledTimes(2));
    await confirmCropper();

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('item-stage-b.jpg', 'static', false));
    expect(cancelBackgroundMediaStage).toHaveBeenCalledWith('dev1', 'stage-a.jpg');
    expect(commitBackgroundMedia).toHaveBeenCalledTimes(1);
  });

  it('counts a file the service refuses, keeps going, and still selects the first success', async () => {
    api.rejected.add('a.jpg');
    const { onSelect } = renderPicker();

    pickFiles([
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await confirmCropper();

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('item-stage-b.jpg', 'static', false));
    expect(screen.getByText('lighting.controls.importFolderPartial:failed=1:total=2')).toBeInTheDocument();
  });

  it('stops at an unreachable service and says so', async () => {
    api.unreachable.add('b.jpg');
    const { onSelect } = renderPicker();

    pickFiles([
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'c.jpg', { type: 'image/jpeg' }),
    ]);
    await confirmCropper();

    await waitFor(() => expect(screen.getByText('lighting.controls.importNetworkError')).toBeInTheDocument());
    expect(stageBackgroundMedia).toHaveBeenCalledTimes(2);
    // What landed before the outage is still selected.
    expect(onSelect).toHaveBeenCalledWith('item-stage-a.jpg', 'static', false);
  });

  it('abandons the queue when the picker unmounts mid-import', async () => {
    let openGate = () => {};
    api.gate = new Promise<void>(resolve => { openGate = resolve; });
    const { onSelect, unmount } = renderPicker();

    pickFiles([
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(stageBackgroundMedia).toHaveBeenCalledTimes(1));
    unmount();
    openGate();
    await act(async () => {});

    expect(stageBackgroundMedia).toHaveBeenCalledTimes(1);
    expect(commitBackgroundMedia).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders no slideshow controls without the settings group', () => {
    renderPicker();
    expect(screen.queryByText('panel.settings.slideshow')).toBeNull();
  });

  it('shows the interval, order and video rows only while the slideshow is on', () => {
    renderPicker(SLIDESHOW_OFF);
    expect(screen.getByText('panel.settings.slideshow')).toBeInTheDocument();
    expect(screen.queryByText('slideshow.interval')).toBeNull();
    expect(screen.queryByText('slideshow.shuffle')).toBeNull();
  });

  it('labels the interval options in the largest whole unit', () => {
    renderPicker({ ...SLIDESHOW_OFF, enabled: true });
    expect(screen.getByText('slideshow.interval')).toBeInTheDocument();
    expect(screen.getByText('slideshow.shuffle')).toBeInTheDocument();
    // The default (30 s) shows on the trigger; the rest are in the menu.
    const trigger = screen.getByRole('button', { name: 'slideshow.interval' });
    expect(trigger).toHaveTextContent('slideshow.seconds.other:count=30');
    fireEvent.click(trigger);
    const labels = screen.getAllByRole('option').map(o => o.textContent);
    expect(labels).toContain('slideshow.seconds.other:count=5');
    expect(labels).toContain('slideshow.minutes.one:count=1');
    expect(labels).toContain('slideshow.hours.one:count=1');
    expect(labels).toContain('slideshow.minutes.other:count=3');
    expect(labels).not.toContain('slideshow.hours.other:count=24');
    expect(screen.getByText('slideshow.finishVideos')).toBeInTheDocument();
  });

  it('turns the slideshow on after importing two or more files', async () => {
    const { onSelect, onSlideshowChange } = renderPicker(SLIDESHOW_OFF);

    pickFiles([
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));
    await waitFor(() => expect(stageBackgroundMedia).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSlideshowChange).toHaveBeenCalledWith({ enabled: true });
  });

  it('leaves a single file as a plain background', async () => {
    const { onSelect, onSlideshowChange } = renderPicker(SLIDESHOW_OFF);

    pickFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSlideshowChange).not.toHaveBeenCalled();
  });

  it('reports a selection with nothing importable without uploading', async () => {
    renderPicker();

    pickFiles([new File(['x'], 'notes.txt', { type: 'text/plain' })]);

    expect(await screen.findByText('lighting.controls.importFolderEmpty')).toBeInTheDocument();
    expect(stageBackgroundMedia).not.toHaveBeenCalled();
  });
});

describe('BackgroundMediaPicker order', () => {
  it('lists the saved order first, then the rest oldest first, with drag handles when reorderable', () => {
    // The service lists newest first.
    api.library = [libraryItem('c', 3), libraryItem('b', 2), libraryItem('a', 1)];
    const { unmount } = renderPicker(SLIDESHOW_OFF);
    expect(cardLabels()).toEqual(['a', 'b', 'c']);
    expect(document.querySelector('[aria-roledescription="sortable"]')).toBeNull();
    unmount();

    renderPicker(SLIDESHOW_OFF, ['b', 'c']);
    expect(cardLabels()).toEqual(['b', 'c', 'a']);
    expect(document.querySelectorAll('[aria-roledescription="sortable"]')).toHaveLength(3);
  });

  it('maps a drop onto the new id order', () => {
    expect(reorderMediaIds(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(reorderMediaIds(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(reorderMediaIds(['a', 'b', 'c'], 'a', 'zz')).toEqual(['a', 'b', 'c']);
  });
});

describe('Klipy picks', () => {
  it('stages the pick, crops it, and selects the result', async () => {
    const { onSelect } = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    fireEvent.click(await screen.findByLabelText('Happy cat'));

    await waitFor(() => expect(stageKlipyBackground).toHaveBeenCalledWith('dev1', 'happy-cat'));
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));

    await waitFor(() => expect(commitBackgroundMedia).toHaveBeenCalledWith(
      'dev1', 'stage-happy-cat', '0.000000,0.000000,1.000000,1.000000', 720, 1280, true, false));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('item-stage-happy-cat', 'static', false));
  });

  it('fit entire image applies to a pick too', async () => {
    renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    fireEvent.click(await screen.findByLabelText('Happy cat'));
    fireEvent.click(await screen.findByLabelText('cropper.fitWhole'));
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));

    await waitFor(() => expect(commitBackgroundMedia).toHaveBeenCalledWith(
      'dev1', 'stage-happy-cat', '0.000000,0.000000,1.000000,1.000000', 720, 1280, true, true));
  });

  it('keeps the picker open and says so when the service is unreachable', async () => {
    vi.mocked(stageKlipyBackground).mockResolvedValueOnce(null);
    const { onSelect } = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    fireEvent.click(await screen.findByLabelText('Happy cat'));

    expect(await screen.findByRole('alert')).toHaveTextContent('lighting.controls.importNetworkError');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Happy cat')).toBeInTheDocument();
  });

  it('blames Klipy, not the service, when the pick is refused', async () => {
    vi.mocked(stageKlipyBackground).mockResolvedValueOnce({ stageId: null, alpha: false, error: true, msg: 'Download failed' });
    renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    fireEvent.click(await screen.findByLabelText('Happy cat'));

    expect(await screen.findByRole('alert')).toHaveTextContent('lighting.controls.klipyPickFailed');
  });
});
