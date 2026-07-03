import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessScreenTab } from './LianLiWirelessScreenTab';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetScreens = vi.fn();
const mockGetMedia = vi.fn();
const mockSetSettings = vi.fn();
const mockSetContent = vi.fn();
const mockImportMedia = vi.fn();
const mockDeleteMedia = vi.fn();

vi.mock('../../../api/lianli-wireless', () => ({
  getLianLiWirelessScreens: (...args: any[]) => mockGetScreens(...args),
  getLianLiWirelessMedia: (...args: any[]) => mockGetMedia(...args),
  setLianLiWirelessScreenSettings: (...args: any[]) => mockSetSettings(...args),
  setLianLiWirelessScreenContent: (...args: any[]) => mockSetContent(...args),
  importLianLiWirelessMedia: (...args: any[]) => mockImportMedia(...args),
  deleteLianLiWirelessMedia: (...args: any[]) => mockDeleteMedia(...args),
}));

const screensData = [
  { serial: 'S1', position: 1, width: 400, height: 400, brightness: 80, rotation: 0, contentType: 'image', mediaId: 'm1' },
  { serial: 'S2', position: 2, width: 400, height: 400, brightness: 50, rotation: 1, contentType: 'off' },
  { serial: 'S3', position: 3, width: 400, height: 400, brightness: 60, rotation: 0, contentType: 'sensor' },
];

const mediaData = [
  { id: 'm1', name: 'Wallpaper', kind: 'image' },
  { id: 'm3', name: 'Poster', kind: 'image' },
  { id: 'm2', name: 'Loop', kind: 'gif' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetScreens.mockResolvedValue(screensData);
  mockGetMedia.mockResolvedValue(mediaData);
  mockSetSettings.mockResolvedValue(true);
  mockSetContent.mockResolvedValue(true);
  mockImportMedia.mockResolvedValue({ id: 'm4', name: 'test.png', kind: 'image' });
  mockDeleteMedia.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderTab() {
  await act(async () => {
    render(<LianLiWirelessScreenTab />);
  });
}

describe('LianLiWirelessScreenTab', () => {
  it('renders a chip per screen plus a group-all chip, defaulting to the first screen', async () => {
    await renderTab();

    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.fanN:{"n":1}' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.fanN:{"n":2}' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.fanN:{"n":3}' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.screenGroupAll' })).toBeInTheDocument();

    // Defaults to screen 1 (image content type).
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }))
      .toHaveTextContent('devices.lianli-wireless.contentTypePicture');
  });

  it('shows a loading note before the screens list resolves', async () => {
    let resolvePromise: (v: typeof screensData) => void = () => {};
    mockGetScreens.mockReturnValue(new Promise(resolve => { resolvePromise = resolve; }));

    render(<LianLiWirelessScreenTab />);
    expect(screen.getByText('devices.lianli-wireless.loadingScreens')).toBeInTheDocument();

    await act(async () => {
      resolvePromise(screensData);
    });
    expect(screen.queryByText('devices.lianli-wireless.loadingScreens')).not.toBeInTheDocument();
  });

  it('shows an empty note when connected but no screens are reported', async () => {
    mockGetScreens.mockResolvedValue([]);
    await renderTab();
    expect(screen.getByText('devices.lianli-wireless.noScreens')).toBeInTheDocument();
  });

  it('switching the selected screen updates the shown content type', async () => {
    await renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.fanN:{"n":2}' }));

    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }))
      .toHaveTextContent('devices.lianli-wireless.contentTypeOff');
  });

  it('changing the content type calls the API for the selected screen only', async () => {
    await renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
    fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.contentTypeSensor' }));

    expect(mockSetContent).toHaveBeenCalledTimes(1);
    expect(mockSetContent).toHaveBeenCalledWith('S1', 'sensor');
  });

  it('shows a coming-soon note for the sensor, clock and animation panels', async () => {
    await renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.fanN:{"n":3}' }));
    expect(screen.getByText('devices.lianli-wireless.comingSoon')).toBeInTheDocument();
  });

  it('selecting the group-all chip broadcasts a brightness commit to every screen', async () => {
    await renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.screenGroupAll' }));

    const slider = screen.getByRole('slider', { name: 'devices.lianli-wireless.brightness' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '30' } });
    fireEvent.pointerUp(slider);

    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledTimes(3));
    expect(mockSetSettings).toHaveBeenCalledWith('S1', { brightness: 30 });
    expect(mockSetSettings).toHaveBeenCalledWith('S2', { brightness: 30 });
    expect(mockSetSettings).toHaveBeenCalledWith('S3', { brightness: 30 });
  });

  it('changing the rotation chip commits the new rotation for the selected screen', async () => {
    await renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.rotationDegrees:{"n":180}' }));

    expect(mockSetSettings).toHaveBeenCalledWith('S1', { rotation: 2 });
  });

  it('lists the media library filtered to the active content type and highlights the current pick', async () => {
    await renderTab();

    const wallpaper = screen.getByRole('button', { name: 'Wallpaper' });
    const poster = screen.getByRole('button', { name: 'Poster' });
    expect(wallpaper).toHaveAttribute('aria-pressed', 'true');
    expect(poster).toHaveAttribute('aria-pressed', 'false');
    // The gif-kind item is not shown while the picture content type is active.
    expect(screen.queryByRole('button', { name: 'Loop' })).not.toBeInTheDocument();

    fireEvent.click(poster);
    expect(mockSetContent).toHaveBeenCalledWith('S1', 'image', 'm3');
  });

  it('deletes media after confirming', async () => {
    await renderTab();

    const poster = screen.getByRole('button', { name: 'Poster' });
    fireEvent.click(within(poster).getByRole('button', { name: 'devices.lianli-wireless.deleteMediaAria' }));

    const dialog = screen.getByRole('alertdialog', { name: 'devices.lianli-wireless.deleteMediaTitle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(mockDeleteMedia).toHaveBeenCalledWith('m3'));
  });

  it('uploads a new image through the crop dialog', async () => {
    await renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.uploadImage' }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toHaveAttribute('accept', 'image/jpeg,image/png');

    const file = new File(['data'], 'test.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    const dialog = screen.getByRole('dialog', { name: 'cropper.title' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'cropper.confirm' }));

    await waitFor(() => expect(mockImportMedia).toHaveBeenCalledTimes(1));
    expect(mockImportMedia).toHaveBeenCalledWith(file, { x: 0, y: 0, w: 1, h: 1 });
    await waitFor(() => expect(mockGetMedia).toHaveBeenCalledTimes(2));
  });
});
