import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsusRyujinExtremeDevicePage } from './AsusRyujinExtremeDevicePage';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockPush = vi.fn();

vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: mockPush }),
}));

vi.mock('../../../api/asus-ryujin-extreme', () => ({
  getRyujinDisplay: () => mockGet(),
  setRyujinDisplay: (patch: unknown) => mockSet(patch),
  RYUJIN_MIN_BRIGHTNESS: 10,
  RYUJIN_MAX_BRIGHTNESS: 100,
}));

const base = {
  isConnected: true,
  brightness: 60,
  rotation: 0,
  sensorCount: 3,
  slots: ['cpu-temp', 'gpu-temp', 'pump-rpm'],
  availableSensors: ['cpu-temp', 'gpu-temp', 'liquid-temp', 'pump-rpm', 'fan-rpm'],
};

async function mount(state = base) {
  mockGet.mockResolvedValue(state);
  await act(async () => {
    render(<AsusRyujinExtremeDevicePage />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue(true);
});

describe('AsusRyujinExtremeDevicePage', () => {
  it('renders the stored brightness and rotation', async () => {
    await mount({ ...base, rotation: 90 });
    const slider = screen.getByRole('slider', { name: /brightnessAria/ });
    expect(slider).toHaveValue('60');
    expect(slider).toHaveAttribute('min', '10');
    expect(slider).toHaveAttribute('max', '100');
    expect(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"0"\}/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('a brightness commit sends only the brightness', async () => {
    await mount();
    const slider = screen.getByRole('slider', { name: /brightnessAria/ });
    await act(async () => {
      fireEvent.change(slider, { target: { value: '35' } });
      fireEvent.pointerUp(slider);
    });
    // The slider defers its commit one tick after release.
    await waitFor(() => expect(mockSet).toHaveBeenCalled());
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ brightness: 35 });
  });

  it('a rotation chip sends only the rotation and checks at once', async () => {
    await mount();
    mockGet.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ }));
    });
    expect(mockSet).toHaveBeenCalledWith({ rotation: 90 });
    expect(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('rolls the rotation back and toasts when the save is refused', async () => {
    await mount();
    mockSet.mockResolvedValue(false);
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ }));
    });
    expect(mockPush).toHaveBeenCalledWith({
      title: 'devices.asus-ryujin-extreme.failedTitle',
      body: 'devices.asus-ryujin-extreme.failedBody',
    });
    expect(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"0"\}/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('disables the controls while the device is not connected', async () => {
    await mount({ ...base, isConnected: false });
    expect(screen.getByRole('slider', { name: /brightnessAria/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ })).toBeDisabled();
  });

  it('skips a poll while a write is in flight', async () => {
    await mount();
    let release: (v: boolean) => void = () => {};
    mockSet.mockReturnValue(new Promise<boolean>(r => { release = r; }));
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ }));
    });
    mockGet.mockClear();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(mockGet).not.toHaveBeenCalled();
    mockGet.mockResolvedValue({ ...base, rotation: 90 });
    await act(async () => { release(true); });
  });

  it('ignores polls during a drag and keeps the knob, then re-reads after the commit', async () => {
    await mount();
    const slider = screen.getByRole('slider', { name: /brightnessAria/ });
    await act(async () => { fireEvent.change(slider, { target: { value: '35' } }); });
    mockGet.mockClear();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(mockGet).not.toHaveBeenCalled();
    expect(slider).toHaveValue('35');
    await act(async () => { fireEvent.pointerUp(slider); });
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith({ brightness: 35 }));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
  });

  it('re-reads the stored brightness after a refused write', async () => {
    await mount();
    mockSet.mockResolvedValue(false);
    const slider = screen.getByRole('slider', { name: /brightnessAria/ });
    await act(async () => {
      fireEvent.change(slider, { target: { value: '35' } });
      fireEvent.pointerUp(slider);
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('slider', { name: /brightnessAria/ })).toHaveValue('60'));
  });

  it('shows one picker per visible reading', async () => {
    await mount();
    expect(screen.getAllByRole('button', { name: /devices\.asus-ryujin-extreme\.reading:/ })).toHaveLength(3);
    expect(screen.getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows two pickers at a count of 2', async () => {
    await mount({ ...base, sensorCount: 2 });
    expect(screen.getAllByRole('button', { name: /devices\.asus-ryujin-extreme\.reading:/ })).toHaveLength(2);
    expect(screen.getByRole('radio', { name: '2' })).toHaveAttribute('aria-checked', 'true');
  });

  it('a readings chip sends only the sensor count', async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: '2' })); });
    expect(mockSet).toHaveBeenCalledWith({ sensorCount: 2 });
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('picking a sensor sends all three slots with only that position changed', async () => {
    await mount();
    const pickers = screen.getAllByRole('button', { name: /devices\.asus-ryujin-extreme\.reading:/ });
    await act(async () => { fireEvent.click(pickers[1]); });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.asus-ryujin-extreme.sensor.liquidTemp' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ slots: ['cpu-temp', 'liquid-temp', 'pump-rpm'] });
  });

  it('skips a poll while a sensor write is in flight', async () => {
    await mount();
    let release: (v: boolean) => void = () => {};
    mockSet.mockReturnValue(new Promise<boolean>(r => { release = r; }));
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: '2' })); });
    mockGet.mockClear();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(mockGet).not.toHaveBeenCalled();
    await act(async () => { release(true); });
  });
});
