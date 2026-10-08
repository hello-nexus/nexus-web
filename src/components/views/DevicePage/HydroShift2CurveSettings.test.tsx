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
  video: null,
  playing: null,
  screenSaverMinutes: 0,
  screenSaverVideo: null,
  screenSaverBrightness: 40,
  offlineClock: false,
  pumpFollowsMotherboard: false,
};

const clip = (name: string, ready = true): HydroShift2CurveMediaItem =>
  ({ name, label: name, thumb: null, durationSec: 5, ready });

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
  mockUpload.mockResolvedValue(null);
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

  it('shows the service refusal when an upload fails', async () => {
    mockUpload.mockResolvedValue('too long');
    await renderSettings({ screenMode: 'video' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'c.mp4')] } });
    fireEvent.click(await screen.findByText(/^cropper:/));
    expect(await screen.findByText('too long')).toBeInTheDocument();
  });

  it('deletes a clip after confirming', async () => {
    await renderSettings({ screenMode: 'video' }, [clip('a.mp4')]);
    fireEvent.click(screen.getByLabelText('devices.lianliCurve.mediaDeleteAria'));
    fireEvent.click(await screen.findByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('a.mp4'));
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
