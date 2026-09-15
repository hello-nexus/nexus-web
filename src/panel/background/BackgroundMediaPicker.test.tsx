import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundMediaPicker } from './BackgroundMediaPicker';
import type { PanelSlideshowSettings } from '../editor/PanelThemeSettings';

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

vi.mock('./useBackgroundMedia', () => ({
  useBackgroundMedia: () => ({ items: [], thumbs: {}, refresh: api.refresh, removeLocal: vi.fn() }),
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

// Every folder file gets the cropper's default centred crop at the panel's
// aspect, so the expected crop strings below follow from these dimensions.
const ASPECT = 720 / 1280;

const SLIDESHOW_OFF: PanelSlideshowSettings = { enabled: false, interval: 30, shuffle: false, finishVideos: true };

function renderPicker(slideshow?: PanelSlideshowSettings) {
  const onSelect = vi.fn();
  const onSlideshowChange = vi.fn();
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
      />
    </StrictMode>,
  );
  return { onSelect, onSlideshowChange, unmount: view.unmount };
}

function folderInput(): HTMLInputElement {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const input = Array.from(inputs).find(el => el.hasAttribute('webkitdirectory'));
  if (!input) throw new Error('folder input not rendered');
  return input;
}

function pickFolder(files: File[]) {
  fireEvent.change(folderInput(), { target: { files } });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.sizes = {};
  api.rejected = new Set();
  api.unreachable = new Set();
  api.gate = null;
});

describe('BackgroundMediaPicker folder import', () => {
  it('renders a directory picker next to the single-file import', () => {
    renderPicker();
    expect(folderInput()).toHaveAttribute('multiple');
    expect(screen.getByText('lighting.controls.importFolder')).toBeInTheDocument();
  });

  it('imports every supported file in name order with a centred crop and selects the first', async () => {
    api.sizes['stage-a.mp4'] = { w: 1000, h: 2000 };
    api.sizes['stage-b.jpg'] = { w: 2000, h: 1000 };
    const { onSelect } = renderPicker();

    pickFolder([
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      new File(['x'], 'a.mp4', { type: 'video/mp4' }),
    ]);

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(vi.mocked(stageBackgroundMedia).mock.calls.map(c => c[1].name)).toEqual(['a.mp4', 'b.jpg']);
    // A source taller than the panel keeps its full width and loses height
    // evenly top and bottom.
    expect(commitBackgroundMedia).toHaveBeenNthCalledWith(1, 'dev1', 'stage-a.mp4', '0.000000,0.055556,1.000000,0.888889', 720, 1280);
    // A source wider than the panel keeps its full height and loses width
    // evenly left and right.
    expect(commitBackgroundMedia).toHaveBeenNthCalledWith(2, 'dev1', 'stage-b.jpg', '0.359375,0.000000,0.281250,1.000000', 720, 1280);
    expect(api.refresh).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('item-stage-a.mp4', 'static', false);
    expect(screen.queryByText(/importFolderPartial|importFolderEmpty/)).toBeNull();
  });

  it('counts rejected files, keeps going, and still selects the first success', async () => {
    api.rejected.add('a.png');
    api.sizes['stage-b.png'] = { w: 720, h: 1280 };
    const { onSelect } = renderPicker();

    pickFolder([
      new File(['x'], 'a.png', { type: 'image/png' }),
      new File(['x'], 'b.png', { type: 'image/png' }),
    ]);

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('item-stage-b.png', 'static', false));
    expect(screen.getByText('lighting.controls.importFolderPartial:failed=1:total=2')).toBeInTheDocument();
    expect(commitBackgroundMedia).toHaveBeenCalledTimes(1);
  });

  it('cancels a stage whose preview cannot be measured', async () => {
    api.sizes['stage-ok.jpg'] = { w: 720, h: 1280 };
    const { onSelect } = renderPicker();

    pickFolder([
      new File(['x'], 'broken.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'ok.jpg', { type: 'image/jpeg' }),
    ]);

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(cancelBackgroundMediaStage).toHaveBeenCalledWith('dev1', 'stage-broken.jpg');
    expect(commitBackgroundMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByText('lighting.controls.importFolderPartial:failed=1:total=2')).toBeInTheDocument();
  });

  it('stops at an unreachable service, keeps what landed, and says so', async () => {
    api.sizes['stage-a.jpg'] = { w: 720, h: 1280 };
    api.unreachable.add('b.jpg');
    const { onSelect } = renderPicker();

    pickFolder([
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'c.jpg', { type: 'image/jpeg' }),
    ]);

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('item-stage-a.jpg', 'static', false));
    expect(screen.getByText('lighting.controls.importNetworkError')).toBeInTheDocument();
    expect(vi.mocked(stageBackgroundMedia).mock.calls.map(c => c[1].name)).toEqual(['a.jpg', 'b.jpg']);
    expect(commitBackgroundMedia).toHaveBeenCalledTimes(1);
  });

  it('abandons the batch when the picker unmounts mid-folder', async () => {
    api.sizes['stage-a.jpg'] = { w: 720, h: 1280 };
    api.sizes['stage-b.jpg'] = { w: 720, h: 1280 };
    let openGate = () => {};
    api.gate = new Promise<void>(resolve => { openGate = resolve; });
    const { onSelect, unmount } = renderPicker();

    pickFolder([
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(stageBackgroundMedia).toHaveBeenCalledTimes(1));
    unmount();
    openGate();
    // The in-flight file still finishes; the loop then reaches its alive check.
    await waitFor(() => expect(commitBackgroundMedia).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(stageBackgroundMedia).toHaveBeenCalledTimes(1);
    expect(api.refresh).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reports a folder with nothing importable without uploading', async () => {
    renderPicker();
    pickFolder([new File(['x'], 'readme.md', { type: 'text/markdown' })]);
    expect(await screen.findByText('lighting.controls.importFolderEmpty')).toBeInTheDocument();
    expect(stageBackgroundMedia).not.toHaveBeenCalled();
  });
});

describe('BackgroundMediaPicker slideshow', () => {
  it('renders no slideshow controls without the settings group', () => {
    renderPicker();
    expect(screen.queryByText('panel.settings.slideshow')).toBeNull();
  });

  it('shows the interval, order and video rows only while the slideshow is on', () => {
    renderPicker(SLIDESHOW_OFF);
    expect(screen.getByText('panel.settings.slideshow')).toBeInTheDocument();
    expect(screen.queryByText('panel.settings.slideshow.interval')).toBeNull();
    expect(screen.queryByText('panel.settings.slideshow.order')).toBeNull();
  });

  it('labels the interval options in the largest whole unit', () => {
    renderPicker({ ...SLIDESHOW_OFF, enabled: true });
    expect(screen.getByText('panel.settings.slideshow.interval')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.slideshow.order')).toBeInTheDocument();
    // The default (30 s) shows on the trigger; the rest are in the menu.
    const trigger = screen.getByRole('button', { name: 'panel.settings.slideshow.interval' });
    expect(trigger).toHaveTextContent('panel.settings.slideshow.seconds.other:count=30');
    fireEvent.click(trigger);
    const labels = screen.getAllByRole('option').map(o => o.textContent);
    expect(labels).toContain('panel.settings.slideshow.seconds.other:count=5');
    expect(labels).toContain('panel.settings.slideshow.minutes.one:count=1');
    expect(labels).toContain('panel.settings.slideshow.hours.one:count=1');
    expect(labels).toContain('panel.settings.slideshow.days.one:count=1');
    // No video in the (mocked, empty) library: nothing to play to the end.
    expect(screen.queryByText('panel.settings.slideshow.finishVideos')).toBeNull();
  });

  it('turns the slideshow on after a folder import of two or more files', async () => {
    api.sizes['stage-a.jpg'] = { w: 720, h: 1280 };
    api.sizes['stage-b.jpg'] = { w: 720, h: 1280 };
    const { onSelect, onSlideshowChange } = renderPicker(SLIDESHOW_OFF);

    pickFolder([
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
    ]);

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSlideshowChange).toHaveBeenCalledWith({ enabled: true });
  });

  it('leaves a single-file folder as a plain background', async () => {
    api.sizes['stage-a.jpg'] = { w: 720, h: 1280 };
    const { onSelect, onSlideshowChange } = renderPicker(SLIDESHOW_OFF);

    pickFolder([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSlideshowChange).not.toHaveBeenCalled();
  });
});
