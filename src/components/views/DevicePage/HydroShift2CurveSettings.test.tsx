import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HydroShift2CurveSettings } from './HydroShift2CurveSettings';
import type { HydroShift2CurveMediaItem, HydroShift2CurveSettings as Settings } from '../../../api/hydroshift2Curve';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

vi.mock('../../common/MediaCropper/MediaCropper', () => ({
  MediaCropper: ({ onConfirm, aspect }: any) => (
    <button type="button" onClick={() => onConfirm({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 })}>
      {`cropper:${aspect.toFixed(3)}`}
    </button>
  ),
}));

const mockGetSettings = vi.fn();
const mockSetSettings = vi.fn();
const mockGetMedia = vi.fn();
const mockUpload = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../api/hydroshift2Curve', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/hydroshift2Curve')>()),
  getHydroShift2CurveSettings: (...a: any[]) => mockGetSettings(...a),
  setHydroShift2CurveSettings: (...a: any[]) => mockSetSettings(...a),
  getHydroShift2CurveMedia: (...a: any[]) => mockGetMedia(...a),
  uploadHydroShift2CurveMedia: (...a: any[]) => mockUpload(...a),
  deleteHydroShift2CurveMedia: (...a: any[]) => mockDelete(...a),
}));

const settings: Settings = {
  connected: true,
  screenMode: 'nexus',
  screenSaverMinutes: 0,
  screenSaverBrightness: 40,
  offlineClock: false,
  pumpFollowsMotherboard: false,
};

const clip = (name: string, ready = true): HydroShift2CurveMediaItem =>
  ({ name, label: name, ready });

async function renderSettings(s: Partial<Settings> = {}, media: HydroShift2CurveMediaItem[] = []) {
  mockGetSettings.mockResolvedValue({ ...settings, ...s });
  mockGetMedia.mockResolvedValue(media);
  await act(async () => {
    render(<HydroShift2CurveSettings />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSetSettings.mockResolvedValue(true);
  mockUpload.mockResolvedValue(true);
  mockDelete.mockResolvedValue(true);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HydroShift2CurveSettings', () => {
  it('renders nothing while the cooler is not connected', async () => {
    await renderSettings({ connected: false });
    expect(screen.queryByText('devices.lianliCurve.screenSection')).not.toBeInTheDocument();
  });

  it('hides the video library in Nexus panel mode', async () => {
    await renderSettings();
    expect(screen.queryByText('devices.lianliCurve.mediaUpload')).not.toBeInTheDocument();
  });

  it('switching the content select to video PUTs the mode', async () => {
    await renderSettings();
    fireEvent.click(screen.getByLabelText('devices.lianliCurve.screenContent'));
    fireEvent.click(await screen.findByRole('option', { name: 'devices.lianliCurve.screenModeVideo' }));
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledWith({ screenMode: 'video' }));
  });

  it('selecting a clip PUTs video mode with its name', async () => {
    await renderSettings({ screenMode: 'video' }, [clip('a.mp4'), clip('b.mp4')]);
    fireEvent.click(screen.getByText('b.mp4'));
    await waitFor(() =>
      expect(mockSetSettings).toHaveBeenCalledWith({ screenMode: 'video', video: 'b.mp4' }));
  });

  it('uploads the picked file with the confirmed crop at the glass aspect', async () => {
    await renderSettings({ screenMode: 'video' });
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(await screen.findByText(`cropper:${(2288 / 1080).toFixed(3)}`));
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    expect(mockUpload).toHaveBeenCalledWith(file, { x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
  });

  it('shows the localized failure when an upload fails', async () => {
    mockUpload.mockResolvedValue(false);
    await renderSettings({ screenMode: 'video' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'c.mp4')] } });
    fireEvent.click(await screen.findByText(/^cropper:/));
    expect(await screen.findByRole('alert')).toHaveTextContent('devices.lianliCurve.mediaUploadFailed');
  });

  it('deletes a clip after confirming', async () => {
    await renderSettings({ screenMode: 'video' }, [clip('a.mp4')]);
    fireEvent.click(screen.getByLabelText('devices.lianliCurve.mediaDeleteAria'));
    fireEvent.click(await screen.findByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('a.mp4'));
  });

  it('shows an error when a delete fails', async () => {
    mockDelete.mockResolvedValue(false);
    await renderSettings({ screenMode: 'video' }, [clip('a.mp4')]);
    fireEvent.click(screen.getByLabelText('devices.lianliCurve.mediaDeleteAria'));
    fireEvent.click(await screen.findByRole('button', { name: 'common.delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('devices.lianliCurve.mediaDeleteFailed');
  });

  it('marks a processing clip with a status overlay', async () => {
    await renderSettings({ screenMode: 'video' }, [clip('a.mp4', false)]);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('revokes the cropper object URL when unmounted with the cropper open', async () => {
    mockGetSettings.mockResolvedValue({ ...settings, screenMode: 'video' });
    mockGetMedia.mockResolvedValue([]);
    let unmount = () => {};
    await act(async () => { unmount = render(<HydroShift2CurveSettings />).unmount; });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'c.mp4')] } });
    await screen.findByText(/^cropper:/);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('a stale poll issued before a write does not undo it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await renderSettings();
    let resolveStale: (v: Settings) => void = () => {};
    mockGetSettings.mockImplementationOnce(() => new Promise<Settings>(r => { resolveStale = r; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    mockGetSettings.mockResolvedValue({ ...settings, offlineClock: true });
    fireEvent.click(screen.getByRole('switch', { name: 'devices.lianliCurve.offlineClock' }));
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledWith({ offlineClock: true }));
    await act(async () => { resolveStale({ ...settings, offlineClock: false }); });
    expect(screen.getByRole('switch', { name: 'devices.lianliCurve.offlineClock' })).toBeChecked();
  });

  it('a poll mid-drag keeps the dragged brightness', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await renderSettings({ screenSaverMinutes: 15 });
    const slider = screen.getByRole('slider', { name: 'devices.lianliCurve.saverBrightnessAria' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '70' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mockGetSettings.mock.calls.length).toBeGreaterThan(1);
    expect(slider.value).toBe('70');
  });

  it('re-committing a brightness the server changed away from sends again', async () => {
    await renderSettings({ screenSaverMinutes: 15 });
    const slider = screen.getByRole('slider', { name: 'devices.lianliCurve.saverBrightnessAria' });
    mockGetSettings.mockResolvedValue({ ...settings, screenSaverMinutes: 15, screenSaverBrightness: 70 });
    fireEvent.change(slider, { target: { value: '50' } });
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((slider as HTMLInputElement).value).toBe('70'));
    fireEvent.change(slider, { target: { value: '50' } });
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledTimes(2));
    expect(mockSetSettings).toHaveBeenLastCalledWith({ screenSaverBrightness: 50 });
  });

  it('dragging back to the server value while a write is in flight still sends it', async () => {
    await renderSettings({ screenSaverMinutes: 15 });
    const slider = screen.getByRole('slider', { name: 'devices.lianliCurve.saverBrightnessAria' });
    let finish: (ok: boolean) => void = () => {};
    mockSetSettings.mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    fireEvent.change(slider, { target: { value: '50' } });
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledTimes(1));
    fireEvent.change(slider, { target: { value: '40' } });
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledTimes(2));
    expect(mockSetSettings).toHaveBeenLastCalledWith({ screenSaverBrightness: 40 });
    await act(async () => { finish(true); });
  });

  it('stops polling on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    mockGetSettings.mockResolvedValue(settings);
    mockGetMedia.mockResolvedValue([clip('a.mp4', false)]);
    let unmount = () => {};
    await act(async () => { unmount = render(<HydroShift2CurveSettings />).unmount; });
    unmount();
    const s0 = mockGetSettings.mock.calls.length;
    const m0 = mockGetMedia.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mockGetSettings.mock.calls.length).toBe(s0);
    expect(mockGetMedia.mock.calls.length).toBe(m0);
  });

  it('polls the library while a clip is still processing', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await renderSettings({ screenMode: 'video' }, [clip('a.mp4', false)]);
    expect(screen.getByText('devices.lianliCurve.mediaProcessing')).toBeInTheDocument();
    const before = mockGetMedia.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mockGetMedia.mock.calls.length).toBeGreaterThan(before);
  });

  it('does not poll the library once every clip is ready', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await renderSettings({ screenMode: 'video' }, [clip('a.mp4')]);
    const before = mockGetMedia.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(mockGetMedia.mock.calls.length).toBe(before);
  });

  it('disables the saver video and brightness while the interval is off', async () => {
    await renderSettings({}, [clip('a.mp4')]);
    expect(screen.getByRole('slider', { name: 'devices.lianliCurve.saverBrightnessAria' })).toBeDisabled();
    expect(screen.getByLabelText('devices.lianliCurve.saverVideo')).toBeDisabled();
  });

  it('PUTs the saver interval, video and brightness', async () => {
    await renderSettings({ screenSaverMinutes: 15, screenSaverVideo: 'a.mp4' }, [clip('a.mp4'), clip('b.mp4')]);
    fireEvent.click(screen.getByLabelText('devices.lianliCurve.saverInterval'));
    fireEvent.click(await screen.findByRole('option', { name: 'devices.lianliCurve.saverMinutes:{"n":"30"}' }));
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledWith({ screenSaverMinutes: 30 }));

    fireEvent.click(screen.getByLabelText('devices.lianliCurve.saverVideo'));
    fireEvent.click(await screen.findByRole('option', { name: 'b.mp4' }));
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledWith({ screenSaverVideo: 'b.mp4' }));

    fireEvent.click(screen.getByLabelText('devices.lianliCurve.saverVideo'));
    fireEvent.click(await screen.findByRole('option', { name: 'devices.lianliCurve.saverVideoNone' }));
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledWith({ screenSaverVideo: '' }));

    const slider = screen.getByRole('slider', { name: 'devices.lianliCurve.saverBrightnessAria' });
    fireEvent.change(slider, { target: { value: '70' } });
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledWith({ screenSaverBrightness: 70 }));
  });

  it('PUTs the clock and pump toggles', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('switch', { name: 'devices.lianliCurve.offlineClock' }));
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledWith({ offlineClock: true }));
    fireEvent.click(screen.getByRole('switch', { name: 'devices.lianliCurve.pumpFollowsMotherboard' }));
    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledWith({ pumpFollowsMotherboard: true }));
  });
});
