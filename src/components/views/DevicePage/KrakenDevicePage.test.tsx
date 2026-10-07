import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KrakenDevicePage } from './KrakenDevicePage';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetKrakenState = vi.fn();
const mockSetKrakenLcd = vi.fn();
const mockUpload = vi.fn();
const mockGetFirmwareLighting = vi.fn();
const mockEncode = vi.fn();
const mockUploadGif = vi.fn();
const mockUploadKlipy = vi.fn();

vi.mock('../../../api/nzxt-kraken', () => ({
  getKrakenState: (...args: any[]) => mockGetKrakenState(...args),
  setKrakenLcd: (...args: any[]) => mockSetKrakenLcd(...args),
  uploadKrakenLcdImage: (...args: any[]) => mockUpload(...args),
  encodeKrakenFrame: (...args: any[]) => mockEncode(...args),
  uploadKrakenLcdGif: (...args: any[]) => mockUploadGif(...args),
  uploadKrakenLcdKlipy: (...args: any[]) => mockUploadKlipy(...args),
  // The settings body mounts the firmware-lighting section too; without these the
  // section's effect rejects and the run fails on an unhandled rejection.
  getKrakenFirmwareLighting: (...args: any[]) => mockGetFirmwareLighting(...args),
  setKrakenFirmwareLighting: vi.fn(),
}));

vi.mock('../../common/KlipyPicker/KlipyPicker', () => ({
  KlipyPicker: ({ open, onPick }: { open: boolean; onPick: (gif: unknown) => void }) => (open
    ? <button type="button" onClick={() => onPick({ slug: 'cat', title: 'Cat', width: 480, height: 270 })}>klipy-pick</button>
    : null),
}));

const connectedState = {
  isConnected: true,
  firmwareVersion: '1.2.0',
  liquidTempC: 27.4,
  pumpRpm: 1876,
  pumpDuty: 40,
  fanRpm: 845,
  fanDuty: 35,
  hasLcd: true,
  lcdWidth: 640,
  lcdHeight: 640,
  lcdBrightness: 80,
  lcdOrientation: 0,
  lcdMode: 'liquid' as const,
  channels: [
    { id: 'nzxt-kraken:led-ring', accessoryName: 'Kraken Elite Ring', ledCount: 24 },
    { id: 'nzxt-kraken:led-fans', accessoryName: 'F240 RGB Core', ledCount: 16 },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  mockGetKrakenState.mockResolvedValue(connectedState);
  mockGetFirmwareLighting.mockResolvedValue({ isConnected: true, effects: [], channels: [] });
  mockSetKrakenLcd.mockResolvedValue({});
  mockUpload.mockResolvedValue(true);
  mockUploadGif.mockResolvedValue(true);
  mockUploadKlipy.mockResolvedValue(true);
  mockEncode.mockResolvedValue(new Uint8Array(4));
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2, height: 2, close: vi.fn() }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('KrakenDevicePage', () => {
  it('renders telemetry for the pump and the fan chain', async () => {
    await act(async () => { render(<KrakenDevicePage />); });

    expect(screen.getByText('devices.nzxt-kraken.statusSection')).toBeInTheDocument();
    // Numbers go through the locale formatter, so match on the unit-suffixed text.
    expect(screen.getByText(/1[,.\s]?876 RPM/)).toBeInTheDocument();
    expect(screen.getByText(/845 RPM/)).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  it('lists each RGB channel the cooler reported with its LED count', async () => {
    await act(async () => { render(<KrakenDevicePage />); });

    expect(screen.getByText('Kraken Elite Ring')).toBeInTheDocument();
    expect(screen.getByText('F240 RGB Core')).toBeInTheDocument();
    expect(screen.getByText('devices.nzxt-kraken.ledCount:{"n":24}')).toBeInTheDocument();
    expect(screen.getByText('devices.nzxt-kraken.ledCount:{"n":16}')).toBeInTheDocument();
  });

  it('shows the disconnected state when the cooler is not present', async () => {
    mockGetKrakenState.mockResolvedValue({ ...connectedState, isConnected: false });

    await act(async () => { render(<KrakenDevicePage />); });

    expect(screen.getByText('devices.nzxt-kraken.notConnected')).toBeInTheDocument();
    expect(screen.queryByText('devices.nzxt-kraken.statusSection')).not.toBeInTheDocument();
  });

  it('explains the screen is unavailable when the bulk pipe did not open', async () => {
    mockGetKrakenState.mockResolvedValue({ ...connectedState, hasLcd: false });

    await act(async () => { render(<KrakenDevicePage />); });

    expect(screen.getByText('devices.nzxt-kraken.screenUnavailable')).toBeInTheDocument();
    // Controls are hidden rather than shown-but-broken.
    expect(screen.queryByText('devices.nzxt-kraken.screenPickImage')).not.toBeInTheDocument();
  });
});

describe('KrakenDevicePage - GIF screen', () => {
  const pick = async (file: File) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  };

  it('hides the GIFs button when the model does not play GIFs', async () => {
    await act(async () => { render(<KrakenDevicePage />); });

    expect(screen.queryByRole('button', { name: 'lighting.controls.klipyBrowse' })).not.toBeInTheDocument();
  });

  it('sends a picked GIF to the gif call when the model plays GIFs', async () => {
    mockGetKrakenState.mockResolvedValue({ ...connectedState, lcdGif: true });
    await act(async () => { render(<KrakenDevicePage />); });

    const gif = new File(['GIF89a'], 'a.gif', { type: 'image/gif' });
    await pick(gif);

    expect(mockUploadGif).toHaveBeenCalledWith(gif);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('keeps the still-frame path for a PNG even when the model plays GIFs', async () => {
    mockGetKrakenState.mockResolvedValue({ ...connectedState, lcdGif: true });
    await act(async () => { render(<KrakenDevicePage />); });

    await pick(new File(['png'], 'a.png', { type: 'image/png' }));

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUploadGif).not.toHaveBeenCalled();
  });

  it('treats a GIF as a still frame when the model does not play GIFs', async () => {
    await act(async () => { render(<KrakenDevicePage />); });

    await pick(new File(['GIF89a'], 'a.gif', { type: 'image/gif' }));

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUploadGif).not.toHaveBeenCalled();
  });

  it('uploads a Klipy pick through the klipy call', async () => {
    mockGetKrakenState.mockResolvedValue({ ...connectedState, lcdGif: true });
    await act(async () => { render(<KrakenDevicePage />); });

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    await act(async () => { fireEvent.click(screen.getByText('klipy-pick')); });

    expect(mockUploadKlipy).toHaveBeenCalledWith('cat');
  });

  it('shows the upload error when a GIF upload fails', async () => {
    mockGetKrakenState.mockResolvedValue({ ...connectedState, lcdGif: true });
    mockUploadGif.mockResolvedValue(false);
    await act(async () => { render(<KrakenDevicePage />); });

    await pick(new File(['GIF89a'], 'a.gif', { type: 'image/gif' }));

    expect(screen.getByText('devices.nzxt-kraken.screenUploadFailed')).toBeInTheDocument();
  });
});
