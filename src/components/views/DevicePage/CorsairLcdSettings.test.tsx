import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorsairLcdSettings } from './CorsairLcdSettings';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockState = vi.fn();
const mockMedia = vi.fn();
const mockSetScreen = vi.fn();
const mockUpload = vi.fn();
const mockStageKlipy = vi.fn();
const mockCancelStage = vi.fn();

vi.mock('../../../api/corsair-lcd', () => ({
  getCorsairLcdState: (...a: any[]) => mockState(...a),
  getCorsairLcdMedia: (...a: any[]) => mockMedia(...a),
  setCorsairDeviceScreen: (...a: any[]) => mockSetScreen(...a),
  setCorsairLcd: vi.fn(),
  uploadCorsairLcdMedia: (...a: any[]) => mockUpload(...a),
}));

vi.mock('../../../api/klipy', () => ({
  stageKlipy: (...a: any[]) => mockStageKlipy(...a),
}));

vi.mock('../../../api/mediaLibrary', () => ({
  cancelMediaStage: (...a: any[]) => mockCancelStage(...a),
  mediaStageRawUrl: (id: string) => `http://svc/media/stage/${id}/raw`,
  mediaStagePreviewUrl: (id: string) => `http://svc/media/stage/${id}/preview`,
  stagePreviewFor: (_kind: string, raw: string, preview: string) => ({ src: raw, kind: 'video', fallbackSrc: preview }),
}));

vi.mock('../../common/KlipyPicker/KlipyPicker', () => ({
  KlipyPicker: ({ open, importError, onPick }: { open: boolean; importError?: string | null; onPick: (gif: unknown) => void }) => (open
    ? (
      <div>
        <button type="button" onClick={() => onPick({ slug: 'cat', title: 'Cat', width: 480, height: 270 })}>klipy-pick</button>
        {importError && <p>{importError}</p>}
      </div>
    )
    : null),
}));

vi.mock('../../common/MediaCropper/MediaCropper', () => ({
  MediaCropper: ({ aspect, onConfirm, onCancel }: { aspect: number; onConfirm: (crop: unknown) => void; onCancel: () => void }) => (
    <div data-testid="cropper" data-aspect={aspect}>
      <button type="button" onClick={() => onConfirm({ x: 0, y: 0, w: 1, h: 1 })}>crop-confirm</button>
      <button type="button" onClick={onCancel}>crop-cancel</button>
    </div>
  ),
}));

const base = { hasDevice: true, selectedMediaId: null, brightness: 50, rotation: 0, deviceMediaId: null };

beforeEach(() => {
  mockState.mockReset().mockResolvedValue(base);
  mockMedia.mockReset().mockResolvedValue({ items: [{ id: 'a1', name: 'Fire', type: 'animated' }] });
  mockSetScreen.mockReset().mockResolvedValue(null);
  mockUpload.mockReset();
  mockStageKlipy.mockReset();
  mockCancelStage.mockReset().mockResolvedValue(undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pick');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => { vi.restoreAllMocks(); });

async function renderSettings() {
  await act(async () => {
    render(<CorsairLcdSettings />);
  });
}

async function pick(label: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.corsair.deviceScreenLabel' })); });
  await act(async () => { fireEvent.click(screen.getByRole('option', { name: label })); });
}

describe('CorsairLcdSettings closed-screen setting', () => {
  it('lists the coolant screen and library items', async () => {
    await renderSettings();
    expect(screen.getByText('devices.corsair.deviceScreenSection')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.corsair.deviceScreenLabel' })); });
    expect(screen.getByRole('option', { name: 'devices.corsair.deviceScreenCoolant' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fire' })).toBeInTheDocument();
  });

  it('applies a library item immediately', async () => {
    await renderSettings();
    await pick('Fire');
    expect(mockSetScreen).toHaveBeenCalledWith('a1');
  });

  it('does not rewrite the cooler when the current choice is picked again', async () => {
    mockState.mockResolvedValue({ ...base, deviceMediaId: 'a1' });
    await renderSettings();
    await pick('Fire');
    expect(mockSetScreen).not.toHaveBeenCalled();
  });

  it('shows the generic failure when restoring the coolant screen is refused', async () => {
    mockState.mockResolvedValue({ ...base, deviceMediaId: 'a1' });
    mockSetScreen.mockResolvedValue(502);
    await renderSettings();
    await pick('devices.corsair.deviceScreenCoolant');
    expect(screen.getByText('devices.corsair.deviceScreenFailed')).toBeInTheDocument();
  });

  it('restores the coolant screen with null', async () => {
    mockState.mockResolvedValue({ ...base, deviceMediaId: 'a1' });
    await renderSettings();
    await pick('devices.corsair.deviceScreenCoolant');
    expect(mockSetScreen).toHaveBeenCalledWith(null);
  });

  it('shows a translated message per failure status', async () => {
    const cases: Array<[number, string]> = [
      [409, 'ErrNotConnected'], [404, 'ErrNotFound'], [413, 'ErrTooLarge'],
      [422, 'ErrUnreadable'], [502, 'ErrRefused'], [500, 'Failed'],
    ];
    for (const [status, key] of cases) {
      mockSetScreen.mockResolvedValue(status);
      const { unmount } = render(<CorsairLcdSettings />);
      await act(async () => { await Promise.resolve(); });
      await pick('Fire');
      expect(screen.getByRole('alert')).toHaveTextContent(`devices.corsair.deviceScreen${key}`);
      unmount();
    }
  });

  it('shows a stored-image option when the cooler holds an unlisted item', async () => {
    mockState.mockResolvedValue({ ...base, deviceMediaId: 'gone' });
    await renderSettings();
    expect(screen.getByRole('button', { name: 'devices.corsair.deviceScreenLabel' })).toHaveTextContent('devices.corsair.deviceScreenStored');
  });

  it('does not show the stored-image option for a listed item or the coolant screen', async () => {
    mockState.mockResolvedValue({ ...base, deviceMediaId: 'a1' });
    await renderSettings();
    expect(screen.getByRole('button', { name: 'devices.corsair.deviceScreenLabel' })).toHaveTextContent('Fire');
  });

  it('sends a local pick through the square cropper, uploads with the crop, then applies it', async () => {
    mockUpload.mockResolvedValueOnce({ id: 'n2', name: 'New', type: 'static' });
    await renderSettings();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'new.png', { type: 'image/png' })] } });
    });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(screen.getByTestId('cropper')).toHaveAttribute('data-aspect', '1');
    await act(async () => { fireEvent.click(screen.getByText('crop-confirm')); });
    expect(mockUpload).toHaveBeenCalledWith(expect.any(File), { x: 0, y: 0, w: 1, h: 1 });
    expect(mockSetScreen).toHaveBeenCalledWith('n2');
    expect(screen.queryByTestId('cropper')).not.toBeInTheDocument();
  });

  it('shows a translated message when the upload fails and does not apply', async () => {
    mockUpload.mockResolvedValueOnce(null);
    await renderSettings();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'bad.png', { type: 'image/png' })] } });
    });
    await act(async () => { fireEvent.click(screen.getByText('crop-confirm')); });
    expect(screen.getByRole('alert')).toHaveTextContent('devices.corsair.deviceScreenUploadFailed');
    expect(mockSetScreen).not.toHaveBeenCalled();
  });

  it('opens the Klipy picker, stages a pick and opens the cropper', async () => {
    mockStageKlipy.mockResolvedValue({ stageId: 'st1', mediaKind: 'video' });
    await renderSettings();
    expect(screen.queryByText('klipy-pick')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    await act(async () => { fireEvent.click(screen.getByText('klipy-pick')); });
    expect(mockStageKlipy).toHaveBeenCalledWith('cat');
    expect(screen.getByTestId('cropper')).toBeInTheDocument();
    expect(screen.queryByText('klipy-pick')).not.toBeInTheDocument();
  });

  it('uploads a staged Klipy pick with the crop, applies it and releases the stage', async () => {
    mockStageKlipy.mockResolvedValue({ stageId: 'st1', mediaKind: 'video' });
    mockUpload.mockResolvedValueOnce({ id: 'k1', name: 'cat', type: 'animated' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: async () => new Blob(['mp4'], { type: 'video/mp4' }) } as Response);
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    await act(async () => { fireEvent.click(screen.getByText('klipy-pick')); });
    await act(async () => { fireEvent.click(screen.getByText('crop-confirm')); });
    expect(fetchSpy).toHaveBeenCalledWith('http://svc/media/stage/st1/raw');
    const [file, crop] = mockUpload.mock.calls[0];
    expect((file as File).name).toBe('cat.mp4');
    expect(crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(mockSetScreen).toHaveBeenCalledWith('k1');
    expect(mockCancelStage).toHaveBeenCalledWith('st1');
    expect(screen.queryByTestId('cropper')).not.toBeInTheDocument();
  });

  it('releases the stage when the cropper is cancelled', async () => {
    mockStageKlipy.mockResolvedValue({ stageId: 'st1', mediaKind: 'gif' });
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    await act(async () => { fireEvent.click(screen.getByText('klipy-pick')); });
    fireEvent.click(screen.getByText('crop-cancel'));
    expect(mockCancelStage).toHaveBeenCalledWith('st1');
    expect(mockUpload).not.toHaveBeenCalled();
    expect(screen.queryByTestId('cropper')).not.toBeInTheDocument();
  });

  it('shows the translated Klipy refusal and keeps the picker open', async () => {
    mockStageKlipy.mockResolvedValue({ stageId: null, error: true });
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    await act(async () => { fireEvent.click(screen.getByText('klipy-pick')); });
    expect(screen.getByText('lighting.controls.klipyPickFailed')).toBeInTheDocument();
    expect(screen.queryByTestId('cropper')).not.toBeInTheDocument();
  });

  it('shows the translated network error when staging is unreachable', async () => {
    mockStageKlipy.mockResolvedValue(null);
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    await act(async () => { fireEvent.click(screen.getByText('klipy-pick')); });
    expect(screen.getByText('lighting.controls.importNetworkError')).toBeInTheDocument();
  });
});
