import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QSeriesCoolerSettings } from './QSeriesCoolerSettings';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetState = vi.fn();
const mockSetTurbo = vi.fn();
const mockGetCurve = vi.fn();
const mockSetCurve = vi.fn();
const mockGetAnimation = vi.fn();
const mockSetAnimation = vi.fn();

vi.mock('../../../api/qseries', async () => {
  const actual = await vi.importActual<typeof import('../../../api/qseries')>('../../../api/qseries');
  return {
    ...actual,
    getQSeriesState: (...args: any[]) => mockGetState(...args),
    setQSeriesTurbo: (...args: any[]) => mockSetTurbo(...args),
    getQSeriesFirmwareCurve: (...args: any[]) => mockGetCurve(...args),
    setQSeriesFirmwareCurve: (...args: any[]) => mockSetCurve(...args),
    getQSeriesFirmwareAnimation: (...args: any[]) => mockGetAnimation(...args),
    setQSeriesFirmwareAnimation: (...args: any[]) => mockSetAnimation(...args),
  };
});

// Matches the component's own DEFAULT_PUMP/DEFAULT_FAN (coolant temp -> duty %).
const DEFAULT_PUMP_API = [
  { tempC: 34, dutyPercent: 32 }, { tempC: 38, dutyPercent: 37 }, { tempC: 43, dutyPercent: 45 },
  { tempC: 47, dutyPercent: 56 }, { tempC: 50, dutyPercent: 91 },
];
const DEFAULT_FAN_API = [
  { tempC: 43, dutyPercent: 29 }, { tempC: 48, dutyPercent: 39 }, { tempC: 51, dutyPercent: 50 },
  { tempC: 54, dutyPercent: 59 }, { tempC: 56, dutyPercent: 91 },
];
const DEFAULT_ANIMATION = { animation: 1, r: 255, g: 255, b: 255, brightness: 100 };

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    connected: true,
    deviceId: 'q60-1',
    productName: 'HYTE Q60',
    variant: 'aio',
    firmwareVersion: '1.2.3',
    pumpRpm: 1800,
    pump2Rpm: 0,
    hasPump2: false,
    controlMode: 1,
    turboOn: false,
    fwAnimationSupported: true,
    fwAnimationBrightnessSupported: true,
    ...overrides,
  };
}

function defaultCurve(overrides: Record<string, unknown> = {}) {
  return {
    connected: true,
    supported: true,
    variant: 'aio',
    tempMin: 20,
    tempMax: 60,
    pump: DEFAULT_PUMP_API,
    fan: DEFAULT_FAN_API,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockResolvedValue(baseState());
  mockGetCurve.mockResolvedValue(defaultCurve());
  mockGetAnimation.mockResolvedValue({ ...DEFAULT_ANIMATION });
  mockSetTurbo.mockResolvedValue({});
  mockSetCurve.mockResolvedValue({});
  mockSetAnimation.mockResolvedValue({});
});

async function renderSettings() {
  await act(async () => {
    render(<QSeriesCoolerSettings />);
  });
}

describe('QSeriesCoolerSettings', () => {
  it('disables Save curves, Save animation, and Reset when the loaded state is already at factory defaults', async () => {
    await renderSettings();

    expect(screen.getByRole('button', { name: 'devices.q60.saveCurve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'devices.q60.saveAnimation' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'cooling.curves.resetBtn' })).toBeDisabled();
  });

  it('enables Reset when turbo is on, and writes only the resources that differ from device state', async () => {
    mockGetState.mockResolvedValue(baseState({ turboOn: true }));
    mockGetAnimation.mockResolvedValue({ animation: 2, r: 10, g: 20, b: 30, brightness: 40 });

    await renderSettings();

    const resetBtn = screen.getByRole('button', { name: 'cooling.curves.resetBtn' });
    expect(resetBtn).not.toBeDisabled();

    fireEvent.click(resetBtn);
    await act(async () => {});

    expect(mockSetTurbo).toHaveBeenCalledWith(false);
    expect(mockSetCurve).not.toHaveBeenCalled();
    expect(mockSetAnimation).toHaveBeenCalledWith(DEFAULT_ANIMATION);
  });

  it('leaves Reset disabled and issues no writes when only the curve differs but stays at default draft', async () => {
    // Device curve is already at default and turbo is off, so nothing here
    // should need a reset write; this also guards against a false-positive
    // "dirty" reading immediately after load.
    await renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'cooling.curves.resetBtn' }));
    await act(async () => {});

    expect(mockSetTurbo).not.toHaveBeenCalled();
    expect(mockSetCurve).not.toHaveBeenCalled();
    expect(mockSetAnimation).not.toHaveBeenCalled();
  });

  it('never writes an unverified animation default when the firmware-animation read has not resolved', async () => {
    // Turbo is off and the curve is already at default, so Reset is only
    // enabled here because the animation baseline is unknown. Clicking it
    // must not blindly PUT the default animation without ever having read
    // the device's actual value.
    mockGetAnimation.mockReturnValue(new Promise(() => {}));

    await renderSettings();

    const resetBtn = screen.getByRole('button', { name: 'cooling.curves.resetBtn' });
    expect(resetBtn).not.toBeDisabled();

    fireEvent.click(resetBtn);
    await act(async () => {});

    expect(mockSetTurbo).not.toHaveBeenCalled();
    expect(mockSetCurve).not.toHaveBeenCalled();
    expect(mockSetAnimation).not.toHaveBeenCalled();
    // The draft must not follow the reset to defaults either: with no baseline a
    // defaults draft would arm Save for the exact blind write Reset just skipped.
    expect(screen.getByRole('button', { name: 'devices.q60.saveAnimation' })).toBeDisabled();
  });

  it('enables Save animation after switching effect, saves the draft, and hides the color picker outside Color', async () => {
    await renderSettings();

    // Color is the default effect, so the hex field starts visible.
    expect(screen.getByRole('textbox', { name: 'common.hexColor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.q60.saveAnimation' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'devices.fwAnimation.effect' }));
    fireEvent.click(screen.getByRole('option', { name: 'devices.fwAnimation.rainbowCycle' }));

    expect(screen.queryByRole('textbox', { name: 'common.hexColor' })).not.toBeInTheDocument();
    const saveBtn = screen.getByRole('button', { name: 'devices.q60.saveAnimation' });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    await act(async () => {});

    expect(mockSetAnimation).toHaveBeenCalledWith({ ...DEFAULT_ANIMATION, animation: 2 });
  });

  it('does not treat the device as disconnected when the firmware-animation read fails transiently', async () => {
    mockGetAnimation.mockRejectedValueOnce(new Error('transient EEPROM read failure'));

    await renderSettings();

    expect(screen.queryByText('devices.q60.notConnected')).not.toBeInTheDocument();
    expect(screen.getByText('devices.q60.turbo')).toBeInTheDocument();
    // The animation section still renders (fwAnimationSupported is true); its
    // controls start disabled until the window-focus retry fills the read in.
    expect(screen.getByRole('button', { name: 'devices.fwAnimation.effect' })).toBeDisabled();
  });

  it('retries the firmware-animation read on window focus after a transient failure', async () => {
    mockGetAnimation.mockRejectedValueOnce(new Error('transient EEPROM read failure'));

    await renderSettings();
    expect(screen.getByRole('button', { name: 'devices.fwAnimation.effect' })).toBeDisabled();

    await act(async () => {
      fireEvent(window, new Event('focus'));
    });

    expect(screen.getByRole('button', { name: 'devices.fwAnimation.effect' })).not.toBeDisabled();
  });

  it('keeps an unsaved animation draft when a focus refresh returns the device value', async () => {
    await renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'devices.fwAnimation.effect' }));
    fireEvent.click(screen.getByRole('option', { name: 'devices.fwAnimation.rainbowCycle' }));
    expect(screen.getByRole('button', { name: 'devices.q60.saveAnimation' })).not.toBeDisabled();

    await act(async () => {
      fireEvent(window, new Event('focus'));
    });

    const saveBtn = screen.getByRole('button', { name: 'devices.q60.saveAnimation' });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    await act(async () => {});
    expect(mockSetAnimation).toHaveBeenCalledWith({ ...DEFAULT_ANIMATION, animation: 2 });
  });

  it('shows a firmware-update hint and no controls when firmware animation is unsupported', async () => {
    mockGetState.mockResolvedValue(baseState({ fwAnimationSupported: false }));

    await renderSettings();

    expect(screen.getByText('devices.q60.fwAnimationUnsupported')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.fwAnimation.effect' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.q60.saveAnimation' })).not.toBeInTheDocument();
  });

  it('shows a brightness-specific hint when only brightness writes are unsupported', async () => {
    mockGetState.mockResolvedValue(baseState({ fwAnimationBrightnessSupported: false }));

    await renderSettings();

    expect(screen.getByText('devices.q60.fwAnimationBrightnessUnsupported')).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'devices.y70.brightness' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.fwAnimation.effect' })).toBeInTheDocument();
  });

  it('renders the not-connected note when the device is disconnected', async () => {
    mockGetState.mockResolvedValue({ ...baseState(), connected: false });

    await renderSettings();

    expect(screen.getByText('devices.q60.notConnected')).toBeInTheDocument();
    expect(screen.queryByText('devices.q60.turbo')).not.toBeInTheDocument();
  });
});
