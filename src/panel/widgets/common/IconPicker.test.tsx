import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { IconPicker, tabForValue } from './IconPicker';
import { uploadDeckImage, uploadDeckAnimated, commitDeckKlipyStage } from '../../../api/deckImages';
import { stageKlipy } from '../../../api/klipy';
import { cancelMediaStage } from '../../../api/mediaLibrary';
import { resizeDeckImage } from '../deck/resizeDeckImage';
import { probeVideoDecodes } from '../deck/deckMedia';
import type { DeckIcon } from '../deck/types';

vi.mock('../deck/useDeckImage', () => ({ useDeckImage: (id?: string) => (id ? { url: 'blob:mock-preview', isVideo: false } : { url: null, isVideo: false }) }));
vi.mock('../deck/resizeDeckImage', () => ({ resizeDeckImage: vi.fn(async () => new Blob(['png'])) }));
vi.mock('../deck/deckMedia', async importOriginal => ({
  ...(await importOriginal<typeof import('../deck/deckMedia')>()),
  probeVideoDecodes: vi.fn(async () => true),
}));
vi.mock('../../../api/deckImages', () => ({
  uploadDeckImage: vi.fn(async () => 'uploaded-id-1'),
  uploadDeckAnimated: vi.fn(async () => ({ id: 'uploaded-id-1' })),
  commitDeckKlipyStage: vi.fn(async () => ({ id: 'klipy-id-1' })),
}));
vi.mock('../../../api/klipy', () => ({ stageKlipy: vi.fn(async () => ({ stageId: 'stage-1', mediaKind: 'gif' })) }));
vi.mock('../../../api/mediaLibrary', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/mediaLibrary')>()),
  cancelMediaStage: vi.fn(async () => {}),
}));
const toastPush = vi.hoisted(() => vi.fn());
vi.mock('../../../components/common/Toast/Toast', () => ({ useToastSafe: () => ({ push: toastPush }) }));
vi.mock('../../../components/common/KlipyPicker/KlipyPicker', () => ({
  KlipyPicker: ({ open, importError, onPick }: { open: boolean; importError?: string | null; onPick: (g: unknown) => void }) =>
    open ? (
      <div>
        <button type="button" onClick={() => onPick({ slug: 'g1', title: 't', width: 10, height: 10 })}>pick-gif</button>
        {importError && <span>{importError}</span>}
      </div>
    ) : null,
}));

// jsdom has no object URLs; the cropper only needs a string to render.
const { createObjectURL, revokeObjectURL } = URL;
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:picked');
  URL.revokeObjectURL = vi.fn();
});
afterAll(() => {
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

// Picks a file, which opens the cropper, then confirms the default crop.
async function pickAndCrop(container: HTMLElement) {
  const file = new File(['x'], 'photo.png', { type: 'image/png' });
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));
}

function renderPicker(value?: DeckIcon) {
  const onChange = vi.fn();
  const utils = render(<IconPicker value={value} onChange={onChange} surface="desktop" desktopEditor />);
  return { ...utils, onChange };
}

describe('tabForValue', () => {
  it('maps an image icon to the custom tab', () => {
    expect(tabForValue({ kind: 'image', value: 'abc' })).toBe('custom');
  });

  it('maps lucide/emoji icons and the undefined/app cases as before', () => {
    expect(tabForValue({ kind: 'lucide', value: 'Rocket' })).toBe('icons');
    expect(tabForValue({ kind: 'emoji', value: '🚀' })).toBe('emoji');
    expect(tabForValue({ kind: 'app', value: 'app1' })).toBe('auto');
    expect(tabForValue(undefined)).toBe('auto');
  });
});

describe('IconPicker tabs', () => {
  it('renders the four standard tabs', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: 'panel.iconPicker.auto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'panel.iconPicker.icons' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'panel.iconPicker.emoji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'panel.iconPicker.custom' })).toBeInTheDocument();
  });

  it('opens on the Custom tab (with the current image previewed) when the value is an image icon', () => {
    renderPicker({ kind: 'image', value: 'abc' });
    expect(screen.getByText('panel.iconPicker.uploadImage')).toBeInTheDocument();
    const preview = screen.getByAltText('') as HTMLImageElement;
    expect(preview.src).toContain('blob:mock-preview');
  });
});

describe('IconPicker Bug 5 - custom image survives Auto <-> Custom', () => {
  it('remembers the uploaded image id and re-emits it when returning to Custom after Auto', async () => {
    const { onChange, container, rerender } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));

    await pickAndCrop(container);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ kind: 'image', value: 'uploaded-id-1' }));

    // The parent commits the uploaded icon; simulate that round trip.
    rerender(<IconPicker value={{ kind: 'image', value: 'uploaded-id-1' }} onChange={onChange} surface="desktop" desktopEditor />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.auto' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    rerender(<IconPicker value={undefined} onChange={onChange} surface="desktop" desktopEditor />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'image', value: 'uploaded-id-1' });
  });

  it('does not re-emit when Custom is picked with no prior image ever set', () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('IconPicker custom upload flow', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('crops, uploads, and reports the new image icon through onChange', async () => {
    const { onChange, container } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));

    await pickAndCrop(container);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ kind: 'image', value: 'uploaded-id-1' }));
    expect(resizeDeckImage).toHaveBeenCalledWith('blob:picked', { x: 0, y: 0, w: 1, h: 1, rotate: 0, mirror: false }, false);
    expect(uploadDeckImage).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'cropper.confirm' })).not.toBeInTheDocument();
  });

  it('passes fit entire image through to the resize', async () => {
    const { container } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(await screen.findByLabelText('cropper.fitWhole'));
    fireEvent.click(screen.getByRole('button', { name: 'cropper.confirm' }));

    await waitFor(() => expect(resizeDeckImage).toHaveBeenCalledWith('blob:picked', expect.anything(), true));
  });

  it('cancelling the cropper uploads nothing and frees the picked file', async () => {
    const { onChange, container } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.cancel' }));

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:picked'));
    expect(uploadDeckImage).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not call onChange when the upload fails', async () => {
    vi.mocked(uploadDeckImage).mockResolvedValueOnce(null);
    const { onChange, container } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));

    await pickAndCrop(container);

    await waitFor(() => expect(screen.getByText('panel.iconPicker.uploadFailed')).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('IconPicker animated and video uploads', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function pick(container: HTMLElement, file: File) {
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
  }
  const confirm = async () => fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));
  const CROP = '0.000000,0.000000,1.000000,1.000000';

  it('accepts images plus mp4 and webm video', () => {
    const { container } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));
    expect(container.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('image/*,video/mp4,video/webm');
  });

  it.each([
    ['anim.gif', 'image/gif'],
    ['clip.mp4', 'video/mp4'],
    ['clip.webm', 'video/webm'],
  ])('opens the cropper for %s and uploads the original file with the serialized crop', async (name, type) => {
    const { onChange, container } = renderPicker();
    const file = new File(['x'], name, { type });
    pick(container, file);

    expect(uploadDeckAnimated).not.toHaveBeenCalled();
    await confirm();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ kind: 'image', value: 'uploaded-id-1' }));
    expect(uploadDeckAnimated).toHaveBeenCalledWith(file, CROP);
    expect(resizeDeckImage).not.toHaveBeenCalled();
  });

  it('cancelling the animated cropper uploads nothing', async () => {
    const { onChange, container } = renderPicker();
    pick(container, new File(['x'], 'a.gif', { type: 'image/gif' }));
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.cancel' }));

    expect(uploadDeckAnimated).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'cropper.confirm' })).not.toBeInTheDocument();
  });

  it('shows an error and opens no cropper when the file is over the cap', () => {
    const { onChange, container } = renderPicker();
    const file = new File(['x'], 'big.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 8 * 1024 * 1024 + 1 });
    pick(container, file);

    expect(screen.getByText('panel.iconPicker.fileTooLarge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cropper.confirm' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects a video type the service does not accept', () => {
    const { container } = renderPicker();
    pick(container, new File(['x'], 'clip.mov', { type: 'video/quicktime' }));
    expect(screen.getByText('panel.iconPicker.unsupportedFile')).toBeInTheDocument();
  });

  it('rejects a .mov with a generic type', () => {
    const { container } = renderPicker();
    pick(container, new File(['x'], 'clip.mov', { type: 'application/octet-stream' }));
    expect(screen.getByText('panel.iconPicker.unsupportedFile')).toBeInTheDocument();
  });

  it('still routes a png through the cropper and resize', async () => {
    const { container } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));
    await pickAndCrop(container);
    await waitFor(() => expect(resizeDeckImage).toHaveBeenCalled());
    expect(uploadDeckImage).toHaveBeenCalledWith(expect.anything());
    expect(uploadDeckAnimated).not.toHaveBeenCalled();
  });

  it('probes decodability for video but not for gif', async () => {
    const { onChange, container } = renderPicker();
    pick(container, new File(['x'], 'a.gif', { type: 'image/gif' }));
    await confirm();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(probeVideoDecodes).not.toHaveBeenCalled();
    pick(container, new File(['x'], 'a.mp4', { type: 'video/mp4' }));
    await confirm();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(probeVideoDecodes).toHaveBeenCalledTimes(1);
  });

  it('shows an error and opens no cropper when the video cannot be decoded', async () => {
    vi.mocked(probeVideoDecodes).mockResolvedValueOnce(false);
    const { onChange, container } = renderPicker();
    pick(container, new File(['x'], 'hevc.mp4', { type: 'video/mp4' }));

    expect(await screen.findByText('panel.iconPicker.videoUndecodable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cropper.confirm' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an upload error when the animated upload returns null', async () => {
    vi.mocked(uploadDeckAnimated).mockResolvedValueOnce({ failure: 'failed' });
    const { onChange, container } = renderPicker();
    pick(container, new File(['x'], 'a.gif', { type: 'image/gif' }));
    await confirm();

    expect(await screen.findByText('panel.iconPicker.uploadFailed')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('words a result over the service cap', async () => {
    vi.mocked(uploadDeckAnimated).mockResolvedValueOnce({ failure: 'tooLarge' });
    const { onChange, container } = renderPicker();
    pick(container, new File(['x'], 'a.gif', { type: 'image/gif' }));
    await confirm();

    expect(await screen.findByText('panel.iconPicker.resultTooLarge')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an upload error when the animated upload throws', async () => {
    vi.mocked(uploadDeckAnimated).mockRejectedValueOnce(new Error('boom'));
    const { onChange, container } = renderPicker();
    pick(container, new File(['x'], 'a.gif', { type: 'image/gif' }));
    await confirm();

    expect(await screen.findByText('panel.iconPicker.uploadFailed')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['application/octet-stream', ''])('opens the cropper for a .mp4 with type "%s" via the extension', async type => {
    const { onChange, container } = renderPicker();
    const file = new File(['x'], 'clip.mp4', { type });
    pick(container, file);
    await confirm();

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(uploadDeckAnimated).toHaveBeenCalledWith(file, CROP);
  });
});

describe('IconPicker Klipy flow', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function openKlipy() {
    const utils = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));
    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    return utils;
  }

  it('stages the pick, crops it, commits the stage with the crop and sets the icon', async () => {
    const { onChange } = openKlipy();
    fireEvent.click(screen.getByRole('button', { name: 'pick-gif' }));
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ kind: 'image', value: 'klipy-id-1' }));
    expect(stageKlipy).toHaveBeenCalledWith('g1');
    expect(commitDeckKlipyStage).toHaveBeenCalledWith('stage-1', '0.000000,0.000000,1.000000,1.000000');
  });

  it('cancelling the cropper drops the stage and commits nothing', async () => {
    const { onChange } = openKlipy();
    fireEvent.click(screen.getByRole('button', { name: 'pick-gif' }));
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.cancel' }));

    expect(cancelMediaStage).toHaveBeenCalledWith('stage-1');
    expect(commitDeckKlipyStage).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the Klipy refusal and opens no cropper when staging is refused', async () => {
    vi.mocked(stageKlipy).mockResolvedValueOnce({ stageId: null, error: true });
    openKlipy();
    fireEvent.click(screen.getByRole('button', { name: 'pick-gif' }));

    expect(await screen.findByText('lighting.controls.klipyPickFailed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cropper.confirm' })).not.toBeInTheDocument();
  });

  it('shows a network error when staging gets no answer', async () => {
    vi.mocked(stageKlipy).mockResolvedValueOnce(null);
    openKlipy();
    fireEvent.click(screen.getByRole('button', { name: 'pick-gif' }));
    expect(await screen.findByText('lighting.controls.importNetworkError')).toBeInTheDocument();
  });

  it('words an expired stage and does not cancel it', async () => {
    vi.mocked(commitDeckKlipyStage).mockResolvedValueOnce({ failure: 'expired' });
    const { onChange } = openKlipy();
    fireEvent.click(screen.getByRole('button', { name: 'pick-gif' }));
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));

    expect(await screen.findByText('panel.iconPicker.stageExpired')).toBeInTheDocument();
    expect(cancelMediaStage).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an upload error and cancels the stage when the commit fails', async () => {
    vi.mocked(commitDeckKlipyStage).mockResolvedValueOnce({ failure: 'failed' });
    const { onChange } = openKlipy();
    fireEvent.click(screen.getByRole('button', { name: 'pick-gif' }));
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));

    expect(await screen.findByText('panel.iconPicker.uploadFailed')).toBeInTheDocument();
    expect(cancelMediaStage).toHaveBeenCalledWith('stage-1');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the cropper open and the stage on a busy reply so the user can confirm again', async () => {
    vi.mocked(commitDeckKlipyStage).mockResolvedValueOnce({ failure: 'busy' });
    const { onChange } = openKlipy();
    fireEvent.click(screen.getByRole('button', { name: 'pick-gif' }));
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));

    await waitFor(() => expect(toastPush).toHaveBeenCalledWith({ title: 'panel.iconPicker.busy' }));
    expect(cancelMediaStage).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'cropper.confirm' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ kind: 'image', value: 'klipy-id-1' }));
    expect(commitDeckKlipyStage).toHaveBeenCalledTimes(2);
  });

  it('cancels the open stage when the picker unmounts', async () => {
    const { unmount } = openKlipy();
    fireEvent.click(screen.getByRole('button', { name: 'pick-gif' }));
    await screen.findByRole('button', { name: 'cropper.confirm' });
    unmount();
    expect(cancelMediaStage).toHaveBeenCalledWith('stage-1');
  });

  it('cancels a stage that lands after the picker unmounted', async () => {
    let resolveStage!: (v: { stageId: string; mediaKind: 'gif' }) => void;
    vi.mocked(stageKlipy).mockReturnValueOnce(new Promise(r => { resolveStage = r; }));
    const { unmount } = openKlipy();
    fireEvent.click(screen.getByRole('button', { name: 'pick-gif' }));
    unmount();
    expect(cancelMediaStage).not.toHaveBeenCalled();
    resolveStage({ stageId: 'late-stage', mediaKind: 'gif' });
    await waitFor(() => expect(cancelMediaStage).toHaveBeenCalledWith('late-stage'));
  });
});
