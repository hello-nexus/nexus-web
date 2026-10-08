import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HydroShift2CurveHeadSettings } from './HydroShift2CurveHeadSettings';
import type { HydroShift2CurveHead } from '../../../api/hydroshift2Curve';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockRecalibrate = vi.fn();

vi.mock('../../../api/hydroshift2Curve', () => ({
  getHydroShift2CurveHead: (...args: any[]) => mockGet(...args),
  setHydroShift2CurveHead: (...args: any[]) => mockSet(...args),
  recalibrateHydroShift2CurveHead: (...args: any[]) => mockRecalibrate(...args),
}));

const head: HydroShift2CurveHead = {
  connected: true,
  tilt: 10,
  slide: -2,
  targetTilt: 10,
  targetSlide: -2,
  moving: false,
  calibrating: false,
  tiltMax: 45,
  slideMin: -10,
  slideMax: 8,
};

async function renderSettings(data: HydroShift2CurveHead = head) {
  mockGet.mockResolvedValue(data);
  await act(async () => {
    render(<HydroShift2CurveHeadSettings />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue({ success: true });
  mockRecalibrate.mockResolvedValue({ success: true });
});

describe('HydroShift2CurveHeadSettings', () => {
  it('renders both sliders from the service ranges and targets', async () => {
    await renderSettings();
    const tilt = screen.getByRole('slider', { name: 'devices.lianliCurve.tiltAria' }) as HTMLInputElement;
    const height = screen.getByRole('slider', { name: 'devices.lianliCurve.heightAria' }) as HTMLInputElement;
    expect([tilt.min, tilt.max, tilt.value]).toEqual(['0', '45', '10']);
    expect([height.min, height.max, height.value]).toEqual(['-10', '8', '-2']);
  });

  it('renders nothing while the cooler is not connected', async () => {
    await renderSettings({ ...head, connected: false });
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('sends the tilt once, on release', async () => {
    await renderSettings();
    const tilt = screen.getByRole('slider', { name: 'devices.lianliCurve.tiltAria' });
    fireEvent.change(tilt, { target: { value: '30' } });
    expect(mockSet).not.toHaveBeenCalled();
    fireEvent.pointerUp(tilt);
    await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
    expect(mockSet).toHaveBeenCalledWith({ tilt: 30 });
  });

  it('sends the height as its own patch', async () => {
    await renderSettings();
    const height = screen.getByRole('slider', { name: 'devices.lianliCurve.heightAria' });
    fireEvent.change(height, { target: { value: '5' } });
    fireEvent.pointerUp(height);
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith({ slide: 5 }));
  });

  it('posts a recalibrate request', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianliCurve.recalibrate' }));
    await waitFor(() => expect(mockRecalibrate).toHaveBeenCalledTimes(1));
  });

  it('disables the sliders and recalibrate while calibrating', async () => {
    await renderSettings({ ...head, calibrating: true });
    expect(screen.getByRole('slider', { name: 'devices.lianliCurve.tiltAria' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'devices.lianliCurve.heightAria' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'devices.lianliCurve.recalibrate' })).toBeDisabled();
    expect(screen.getByText('devices.lianliCurve.statusCalibrating')).toBeInTheDocument();
  });

  it('shows the moving state', async () => {
    await renderSettings({ ...head, moving: true });
    expect(screen.getByText('devices.lianliCurve.statusMoving')).toBeInTheDocument();
  });
});
