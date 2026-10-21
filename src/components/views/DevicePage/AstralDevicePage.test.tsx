import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AstralDevicePage } from './AstralDevicePage';
import type { AstralLevelSense, AstralLevelSenseGpu, AstralPowerState } from '../../../api/astral';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockLevel = vi.fn();
const mockCalibrate = vi.fn();
const mockPower = vi.fn();
const mockConfig = vi.fn();
const mockCancel = vi.fn();
const mockNow = vi.fn();

vi.mock('../../../api/astral', () => ({
  getAstralLevelSense: (...a: any[]) => mockLevel(...a),
  calibrateAstralLevelSense: (...a: any[]) => mockCalibrate(...a),
  getAstralPower: (...a: any[]) => mockPower(...a),
  setAstralPowerConfig: (...a: any[]) => mockConfig(...a),
  cancelAstralShutdown: (...a: any[]) => mockCancel(...a),
  astralShutdownNow: (...a: any[]) => mockNow(...a),
}));

const P = 'devices.astral.';

function level(over: Partial<AstralLevelSenseGpu> = {}): AstralLevelSense {
  return {
    gpus: [{
      gpuId: '/gpu-nvidia/0', name: 'ASUS ROG Astral RTX 5090', calibrating: false,
      calibratedAtMs: 1_760_000_000_000, sag: 0.18, lean: -0.62, ...over,
    }],
  };
}

function power(over: Partial<AstralPowerState> = {}): AstralPowerState {
  return {
    supported: true,
    gpus: [{ gpuId: '/gpu-nvidia/0', name: 'ASUS ROG Astral RTX 5090', pinAmps: [1.1, 1.2, 8.7, 1.1, 9.4, 1.0], readAtMs: 1 }],
    level: 'normal',
    overcurrentAmps: 12.5,
    criticalAmps: 17,
    pinWarnAmps: 9.2,
    pinLowAmps: 0.01,
    pinCautionAmps: 8.5,
    countdown: null,
    shuttingDown: false,
    heldOff: false,
    alert: null,
    settings: {
      trayAlerts: true, inAppAlerts: true, equalizer: false, hideEqualizerReminder: false,
      overcurrentShutdown: false, overcurrentSeconds: 60, countdownSeconds: 60, criticalShutdown: false,
    },
    ...over,
  };
}

function openPowerTab() {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${P}powerTab$`) }));
}

beforeEach(() => {
  mockLevel.mockResolvedValue(level());
  mockPower.mockResolvedValue(power());
  mockCalibrate.mockResolvedValue({ gpus: ['/gpu-nvidia/0'] });
  mockConfig.mockImplementation(async (patch: any) => power({ settings: { ...power().settings, ...patch } }));
  mockCancel.mockResolvedValue({ ok: true });
  mockNow.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AstralDevicePage Level Sense', () => {
  it('shows sag and tilt with the way each moved, past the limit in firmer words', async () => {
    render(<AstralDevicePage />);

    expect(await screen.findByText('+0.18°')).toBeInTheDocument();
    expect(screen.getByText('−0.62°')).toBeInTheDocument();
    expect(screen.getByText(`${P}sagDownSlight`)).toBeInTheDocument();
    expect(screen.getByText(`${P}leanBack`)).toBeInTheDocument();
    expect(screen.getByText(`${P}over:{"limit":"0.50"}`)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `${P}sideView` })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `${P}endView` })).toBeInTheDocument();
  });

  it('dates the calibration DD/MM/YYYY while the date format is the system one', async () => {
    render(<AstralDevicePage />);

    expect(await screen.findByText(/^devices\.astral\.calibrated:\{"when":"\d{2}\/\d{2}\/\d{4} /)).toBeInTheDocument();
  });

  it('says unchanged under the noise, with the real number, and that it is not calibrated yet', async () => {
    mockLevel.mockResolvedValue(level({ sag: 0.05, lean: -0.02, calibratedAtMs: null }));
    render(<AstralDevicePage />);

    expect(await screen.findByText('+0.05°')).toBeInTheDocument();
    expect(screen.getByText('−0.02°')).toBeInTheDocument();
    expect(screen.getAllByText(`${P}unchanged`)).toHaveLength(2);
    expect(screen.getByText(`${P}notCalibrated`)).toBeInTheDocument();
    expect(screen.getByText(`${P}ok`)).toBeInTheDocument();
  });

  it('shows no tilt sensor for a card without one', async () => {
    mockLevel.mockResolvedValue({ gpus: [] });
    render(<AstralDevicePage />);

    expect(await screen.findByText(`${P}noSensor`)).toBeInTheDocument();
  });

  it('calibrates only once the confirmation is answered', async () => {
    render(<AstralDevicePage />);
    await screen.findByText('+0.18°');

    fireEvent.click(screen.getByRole('button', { name: `${P}calibrate` }));
    const dialog = screen.getByRole('alertdialog', { name: `${P}calibrateConfirmTitle` });
    expect(mockCalibrate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: `${P}calibrate` }));

    await waitFor(() => expect(mockCalibrate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(`${P}calibrating`)).toBeInTheDocument();
  });

  it('says so when the calibration did not start', async () => {
    mockCalibrate.mockResolvedValue({ gpus: [] });
    render(<AstralDevicePage />);
    await screen.findByText('+0.18°');

    fireEvent.click(screen.getByRole('button', { name: `${P}calibrate` }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: `${P}calibrate` }));

    expect(await screen.findByText(`${P}calibrateFailed`)).toBeInTheDocument();
  });
});

describe('AstralDevicePage Power detector', () => {
  it('shows each pin, the total and the connector', async () => {
    render(<AstralDevicePage />);
    openPowerTab();

    expect(await screen.findByText('8.7 A')).toBeInTheDocument();
    expect(screen.getByText('9.4 A')).toBeInTheDocument();
    expect(screen.getByText(`${P}total:{"value":"22.5 A"}`)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `${P}connectorAlt` })).toBeInTheDocument();
  });

  it('asks before turning on an automatic shutdown, and saves it only then', async () => {
    render(<AstralDevicePage />);
    openPowerTab();
    await screen.findByText('8.7 A');

    fireEvent.click(screen.getByRole('switch', { name: `${P}overShutdown` }));
    const dialog = screen.getByRole('alertdialog', { name: `${P}confirmShutdownTitle` });
    expect(mockConfig).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: `${P}turnOn` }));

    await waitFor(() => expect(mockConfig).toHaveBeenCalledWith({ overcurrentShutdown: true }));
  });

  it('turns a setting off at once, without asking', async () => {
    render(<AstralDevicePage />);
    openPowerTab();
    await screen.findByText('8.7 A');

    fireEvent.click(screen.getByRole('switch', { name: `${P}trayAlerts` }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(mockConfig).toHaveBeenCalledWith({ trayAlerts: false }));
  });

  it('offers to cancel a running countdown in a pop-up', async () => {
    const now = Date.now();
    mockPower.mockResolvedValue(power({
      countdown: { reason: 'overcurrent', startedAtMs: now, endsAtMs: now + 60_000, text: 'Pin 3 is over its limit.' },
    }));
    render(<AstralDevicePage />);

    const dialog = await screen.findByRole('alertdialog', { name: `${P}countdownTitle:{"left":"1:00"}` });
    fireEvent.click(within(dialog).getByRole('button', { name: `${P}cancelShutdown` }));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the latest alert once', async () => {
    mockPower.mockResolvedValue(power({
      alert: { id: 1, level: 'overcurrent', title: 'High current in the GPU power cable', text: 'Pin 3 is carrying 13.0 A.', atMs: Date.now() },
    }));
    render(<AstralDevicePage />);

    const dialog = await screen.findByRole('alertdialog', { name: 'High current in the GPU power cable' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'confirm.ok' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not bring back the alert a countdown answered once the countdown is over', async () => {
    const now = Date.now();
    const alert = { id: 1, level: 'overcurrent', title: 'High current in the GPU power cable', text: 'Pin 3 is carrying 13.2 A.', atMs: now - 10_000 };
    mockPower.mockResolvedValue(power({
      alert,
      countdown: { reason: 'overcurrent', startedAtMs: now, endsAtMs: now + 30_000, text: 'Pin 3 is over its limit.' },
    }));
    render(<AstralDevicePage />);
    await screen.findByRole('alertdialog', { name: `${P}countdownTitle:{"left":"0:30"}` });

    // The countdown ran out (or was cancelled elsewhere): the alert stays answered.
    mockPower.mockResolvedValue(power({ alert, heldOff: true }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(), { timeout: 3000 });
  });

  it('shows no power detector for a card without one', async () => {
    mockPower.mockResolvedValue(power({ supported: false, gpus: [] }));
    render(<AstralDevicePage />);
    openPowerTab();

    expect(await screen.findByText(`${P}noPower`)).toBeInTheDocument();
  });
});
