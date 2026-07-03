import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessCoolingTab } from './LianLiWirelessCoolingTab';
import type { LianLiWirelessState } from '../../../api/lianli-wireless';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockFetchFanChannels = vi.fn();
const mockSetFanSpeed = vi.fn();
const mockReleaseFanAuto = vi.fn();

vi.mock('../../../api/cooling', () => ({
  fetchFanChannels: (...args: any[]) => mockFetchFanChannels(...args),
  setFanSpeed: (...args: any[]) => mockSetFanSpeed(...args),
  releaseFanAuto: (...args: any[]) => mockReleaseFanAuto(...args),
}));

const boundFan = {
  mac: '998D1DE566E1',
  masterMac: '8A0EEF6232DC',
  boundToUs: true,
  channel: 8,
  slot: 1,
  devType: 0,
  fanType: 24,
  fanCount: 2,
  rpm: [1918, 1905, 0, 0],
  pwm: [45, 6, 0, 0],
};

const wirelessState: LianLiWirelessState = {
  isConnected: true,
  masterMac: '8A0EEF6232DC',
  channel: 8,
  txFirmwareVersion: 16,
  fans: [boundFan],
};

const channelsFixture = [
  { id: 'lianli-wireless:998D1DE566E1:port0', name: 'Wireless Fan 1', dutyPercent: 45, rpm: 1918, mode: 'Manual' },
  { id: 'lianli-wireless:998D1DE566E1:port1', name: 'Wireless Fan 2', dutyPercent: 6, rpm: 1905, mode: 'Auto' },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockFetchFanChannels.mockResolvedValue({ channels: channelsFixture });
  mockSetFanSpeed.mockResolvedValue({ error: false });
  mockReleaseFanAuto.mockResolvedValue({ error: false });
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderTab(state: LianLiWirelessState | null = wirelessState, onSectionNavigate?: (s: string) => void) {
  await act(async () => {
    render(<LianLiWirelessCoolingTab state={state} onSectionNavigate={onSectionNavigate} />);
  });
}

describe('LianLiWirelessCoolingTab', () => {
  it('renders a port row per bound fan with live RPM and its channel mode', async () => {
    await renderTab();

    expect(screen.getByText('devices.lianli-wireless.fanTypeSlv3Lcd')).toBeInTheDocument();
    expect(screen.getByText('1,918 RPM')).toBeInTheDocument();
    expect(screen.getByText('1,905 RPM')).toBeInTheDocument();

    const modeSelects = screen.getAllByRole('button', { name: 'cooling.card.mode' });
    expect(modeSelects).toHaveLength(2);
    expect(modeSelects[0]).toHaveTextContent('cooling.card.manual');
    expect(modeSelects[1]).toHaveTextContent('cooling.card.bios');
  });

  it('shows a speed slider only for the port in Manual mode', async () => {
    await renderTab();
    expect(screen.getByRole('slider', { name: 'devices.lianli-wireless.fanSpeed' })).toBeInTheDocument();
  });

  it('shows the empty note when no wireless fans are bound', async () => {
    await renderTab({ ...wirelessState, fans: [] });
    expect(screen.getByText('devices.lianli-wireless.noFansPaired')).toBeInTheDocument();
  });

  it('shows the curve hint and, when onSectionNavigate is provided, a Go to Cooling button', async () => {
    const spy = vi.fn();
    await renderTab(wirelessState, spy);
    expect(screen.getByText('devices.lianli-wireless.coolingCurveHint')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.goToCooling' }));
    expect(spy).toHaveBeenCalledWith('cooling');
  });

  it('does not render the Go to Cooling button without onSectionNavigate', async () => {
    await renderTab(wirelessState);
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.goToCooling' })).not.toBeInTheDocument();
  });

  it('switching a port to Manual calls setFanSpeed with the last known duty', async () => {
    await renderTab();

    const modeSelects = screen.getAllByRole('button', { name: 'cooling.card.mode' });
    fireEvent.click(modeSelects[1]);
    fireEvent.click(screen.getByRole('option', { name: 'cooling.card.manual' }));

    expect(mockSetFanSpeed).toHaveBeenCalledWith('lianli-wireless:998D1DE566E1:port1', 6);
  });

  it('switching a port to BIOS calls releaseFanAuto', async () => {
    await renderTab();

    const modeSelects = screen.getAllByRole('button', { name: 'cooling.card.mode' });
    fireEvent.click(modeSelects[0]);
    fireEvent.click(screen.getByRole('option', { name: 'cooling.card.bios' }));

    expect(mockReleaseFanAuto).toHaveBeenCalledWith('lianli-wireless:998D1DE566E1:port0');
  });

  it('shows a curve-active note instead of the mode control when a port is Curve-driven', async () => {
    mockFetchFanChannels.mockResolvedValue({
      channels: [{ ...channelsFixture[0], mode: 'Curve' }, channelsFixture[1]],
    });
    await renderTab();
    expect(screen.getByText('devices.lianli-wireless.coolingCurveActive')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'cooling.card.mode' })).toHaveLength(1);
  });

  it('polls the fan channels on an interval', async () => {
    await renderTab();
    expect(mockFetchFanChannels).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockFetchFanChannels).toHaveBeenCalledTimes(2);
  });
});
