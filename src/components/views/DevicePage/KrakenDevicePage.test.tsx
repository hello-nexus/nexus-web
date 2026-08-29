import { act, render, screen } from '@testing-library/react';
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

vi.mock('../../../api/nzxt-kraken', () => ({
  getKrakenState: (...args: any[]) => mockGetKrakenState(...args),
  setKrakenLcd: (...args: any[]) => mockSetKrakenLcd(...args),
  uploadKrakenLcdImage: (...args: any[]) => mockUpload(...args),
  encodeKrakenFrame: vi.fn(),
  // The settings body mounts the firmware-lighting section too; without these the
  // section's effect rejects and the run fails on an unhandled rejection.
  getKrakenFirmwareLighting: (...args: any[]) => mockGetFirmwareLighting(...args),
  setKrakenFirmwareLighting: vi.fn(),
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
});

afterEach(() => {
  vi.useRealTimers();
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
