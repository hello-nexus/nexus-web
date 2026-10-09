import { act, fireEvent, render, screen } from '@testing-library/react';
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

const mockRescan = vi.fn();

vi.mock('../../../api/corsair', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/corsair')>()),
  getCorsairState: (...args: any[]) => mockGetCorsairState(...args),
  rescanCorsairHub: (...args: any[]) => mockRescan(...args),
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
  mockRescan.mockReset();
  mockRescan.mockResolvedValue(true);
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

  it('without hubs renders one section with firmware and a re-detect button', async () => {
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    expect(screen.getByText('devices.corsair.devicesSection')).toBeInTheDocument();
    expect(screen.queryByText(/hubDevicesSection/)).not.toBeInTheDocument();
    expect(screen.getByText('fw 3.2.571')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.corsair.rescan' })).toBeEnabled();
  });

  it('renders one section per hub with numbered titles and per-hub firmware', async () => {
    const dev = connectedState.devices;
    mockGetCorsairState.mockResolvedValue({
      ...connectedState,
      hubs: [
        { id: 'corsair', number: 1, isConnected: true, firmware: '3.2.571', redetecting: false, devices: dev },
        { id: 'corsair:0a1b2c3d', number: 2, isConnected: true, firmware: '3.3.0', redetecting: false, devices: [{ ...dev[0], name: 'Second hub fan' }] },
      ],
    });
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    expect(screen.getByText('devices.corsair.hubDevicesSection:{"n":1}')).toBeInTheDocument();
    expect(screen.getByText('devices.corsair.hubDevicesSection:{"n":2}')).toBeInTheDocument();
    expect(screen.getByText('fw 3.3.0')).toBeInTheDocument();
    expect(screen.getByText('Second hub fan')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'devices.corsair.rescan' })).toHaveLength(2);
  });

  it('posts a rescan for that hub id and disables the button while in flight', async () => {
    const dev = connectedState.devices;
    mockGetCorsairState.mockResolvedValue({
      ...connectedState,
      hubs: [
        { id: 'corsair', number: 1, isConnected: true, firmware: '1', redetecting: false, devices: dev },
        { id: 'corsair:0a1b2c3d', number: 2, isConnected: true, firmware: '2', redetecting: false, devices: dev },
      ],
    });
    let release: (v: boolean) => void = () => {};
    mockRescan.mockReturnValue(new Promise<boolean>(r => { release = r; }));
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    const buttons = screen.getAllByRole('button', { name: 'devices.corsair.rescan' });
    await act(async () => {
      fireEvent.click(buttons[1]);
    });
    expect(mockRescan).toHaveBeenCalledWith('corsair:0a1b2c3d');
    const busy = screen.getByRole('button', { name: 'devices.corsair.rescanning' });
    expect(busy).toBeDisabled();
    await act(async () => {
      release(true);
    });
    expect(screen.queryByRole('button', { name: 'devices.corsair.rescanning' })).not.toBeInTheDocument();
  });

  it('disables the button while the service reports redetecting', async () => {
    mockGetCorsairState.mockResolvedValue({
      ...connectedState,
      redetecting: true,
      hubs: [{ id: 'corsair', number: 1, isConnected: true, firmware: '1', redetecting: true, devices: connectedState.devices }],
    });
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    expect(screen.getByRole('button', { name: 'devices.corsair.rescanning' })).toBeDisabled();
  });

  it('re-enables the button when the service refuses the rescan', async () => {
    mockRescan.mockResolvedValue(false);
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.corsair.rescan' }));
    });
    expect(mockRescan).toHaveBeenCalledWith('corsair');
    expect(screen.getByRole('button', { name: 'devices.corsair.rescan' })).toBeEnabled();
  });

  it('disables the button of a disconnected hub while another hub is connected', async () => {
    const dev = connectedState.devices;
    mockGetCorsairState.mockResolvedValue({
      ...connectedState,
      hubs: [
        { id: 'corsair', number: 1, isConnected: true, firmware: '1', redetecting: false, devices: dev },
        { id: 'corsair:0a1b2c3d', number: 2, isConnected: false, firmware: '', redetecting: false, devices: [] },
      ],
    });
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    const buttons = screen.getAllByRole('button', { name: 'devices.corsair.rescan' });
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeDisabled();
  });

  it('shows the not-connected state when every hub is disconnected', async () => {
    mockGetCorsairState.mockResolvedValue({
      isConnected: false,
      firmware: '',
      devices: [],
      hubs: [
        { id: 'corsair', number: 1, isConnected: false, firmware: '', redetecting: false, devices: [] },
        { id: 'corsair:0a1b2c3d', number: 2, isConnected: false, firmware: '', redetecting: false, devices: [] },
      ],
    });
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    expect(screen.getByText('devices.corsair.notConnected')).toBeInTheDocument();
  });

  it('ignores a stale poll response that resolves after a newer one', async () => {
    const hub = (redetecting: boolean) => ({ id: 'corsair', number: 1, isConnected: true, firmware: '1', redetecting, devices: connectedState.devices });
    const stale = { ...connectedState, hubs: [hub(false)] };
    const fresh = { ...connectedState, hubs: [hub(true)] };
    let resolveStale: (v: unknown) => void = () => {};
    mockGetCorsairState
      .mockResolvedValueOnce(fresh)
      .mockReturnValueOnce(new Promise(r => { resolveStale = r; }))
      .mockResolvedValue(fresh);
    await act(async () => {
      render(<CorsairDevicePage />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      resolveStale(stale);
    });
    expect(screen.getByRole('button', { name: 'devices.corsair.rescanning' })).toBeDisabled();
  });
});
