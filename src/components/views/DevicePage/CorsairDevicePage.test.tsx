import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorsairDevicePage } from './CorsairDevicePage';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetCorsairState = vi.fn();

vi.mock('../../../api/corsair', () => ({
  getCorsairState: (...args: any[]) => mockGetCorsairState(...args),
}));

const connectedState = {
  isConnected: true,
  firmware: '3.2.571',
  devices: [
    { channel: 1, name: 'iCUE LINK QX RGB', deviceClass: 'Fan', ledCount: 34, hasSpeed: true, hasTemperature: true, rpm: 480, tempC: 28.5, serial: 'A1B2C3D4E5F60001' },
    { channel: 2, name: 'iCUE LINK LX360', deviceClass: 'Aio', ledCount: 16, hasSpeed: false, hasTemperature: false, rpm: -1, tempC: null, serial: 'A1B2C3D4E5F60002' },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  mockGetCorsairState.mockResolvedValue(connectedState);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CorsairDevicePage', () => {
  it('renders connected state with detected devices', async () => {
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    expect(screen.getByText('devices.corsair.devicesSection')).toBeInTheDocument();
    expect(screen.getByText('iCUE LINK QX RGB')).toBeInTheDocument();
    expect(screen.getByText('iCUE LINK LX360')).toBeInTheDocument();
  });

  it('renders channel position badges and LED counts', async () => {
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    expect(screen.getByText('devices.corsair.channel:{"n":1}')).toBeInTheDocument();
    expect(screen.getByText('devices.corsair.channel:{"n":2}')).toBeInTheDocument();
    expect(screen.getByText('devices.corsair.leds:{"n":34}')).toBeInTheDocument();
    expect(screen.getByText('devices.corsair.leds:{"n":16}')).toBeInTheDocument();
  });

  it('does not render device serials', async () => {
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    expect(screen.queryByText('A1B2C3D4E5F60001')).not.toBeInTheDocument();
    expect(screen.queryByText('A1B2C3D4E5F60002')).not.toBeInTheDocument();
  });

  it('renders disconnected placeholder when not connected', async () => {
    mockGetCorsairState.mockResolvedValue({ isConnected: false, firmware: '', devices: [] });
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    expect(screen.getByText('devices.corsair.notConnected')).toBeInTheDocument();
  });

  it('renders navigation buttons when onSectionNavigate is provided', async () => {
    const spy = vi.fn();
    await act(async () => {
      render(<CorsairDevicePage onSectionNavigate={spy} />);
    });
    expect(screen.getByRole('button', { name: 'devices.corsair.goToCooling' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.corsair.goToLighting' })).toBeInTheDocument();
  });

  it('calls onSectionNavigate with cooling when cooling button clicked', async () => {
    const spy = vi.fn();
    await act(async () => {
      render(<CorsairDevicePage onSectionNavigate={spy} />);
    });
    screen.getByRole('button', { name: 'devices.corsair.goToCooling' }).click();
    expect(spy).toHaveBeenCalledWith('cooling');
  });

  it('calls onSectionNavigate with lighting when lighting button clicked', async () => {
    const spy = vi.fn();
    await act(async () => {
      render(<CorsairDevicePage onSectionNavigate={spy} />);
    });
    screen.getByRole('button', { name: 'devices.corsair.goToLighting' }).click();
    expect(spy).toHaveBeenCalledWith('lighting');
  });

  it('does not render navigation buttons when onSectionNavigate is absent', async () => {
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    expect(screen.queryByRole('button', { name: 'devices.corsair.goToCooling' })).not.toBeInTheDocument();
  });
});
