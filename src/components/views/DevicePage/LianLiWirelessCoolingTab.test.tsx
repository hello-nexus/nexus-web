import { act, render, screen } from '@testing-library/react';
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

const mockBindLianLiWirelessFan = vi.fn();
const mockUnbindLianLiWirelessFan = vi.fn();
const mockIdentifyLianLiWirelessFan = vi.fn();

vi.mock('../../../api/lianli-wireless', () => ({
  bindLianLiWirelessFan: (...args: any[]) => mockBindLianLiWirelessFan(...args),
  unbindLianLiWirelessFan: (...args: any[]) => mockUnbindLianLiWirelessFan(...args),
  identifyLianLiWirelessFan: (...args: any[]) => mockIdentifyLianLiWirelessFan(...args),
}));

const mockFetchFanChannels = vi.fn();
const mockFetchCurves = vi.fn();

vi.mock('../../../api/cooling', () => ({
  fetchFanChannels: (...args: any[]) => mockFetchFanChannels(...args),
  fetchCurves: (...args: any[]) => mockFetchCurves(...args),
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
  mockFetchCurves.mockResolvedValue({ globalSpeedModifier: 100, curves: [] });
  mockBindLianLiWirelessFan.mockResolvedValue(true);
  mockUnbindLianLiWirelessFan.mockResolvedValue(true);
  mockIdentifyLianLiWirelessFan.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderTab(state: LianLiWirelessState | null = wirelessState) {
  await act(async () => {
    render(<LianLiWirelessCoolingTab state={state} />);
  });
}

describe('LianLiWirelessCoolingTab', () => {
  it('renders each occupied port with its live RPM and mode, with no controls', async () => {
    await renderTab();

    expect(screen.getByText('devices.lianli-wireless.fanTypeSlv3Lcd')).toBeInTheDocument();
    expect(screen.getByText('1,918 RPM')).toBeInTheDocument();
    expect(screen.getByText('1,905 RPM')).toBeInTheDocument();
    expect(screen.getByText('cooling.card.manual')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('cooling.card.bios')).toBeInTheDocument();
    expect(screen.queryByText('6%')).not.toBeInTheDocument();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('names the curve driving a Curve port, with its duty', async () => {
    mockFetchFanChannels.mockResolvedValue({
      channels: [{ ...channelsFixture[0], mode: 'Curve', dutyPercent: 38 }, channelsFixture[1]],
    });
    mockFetchCurves.mockResolvedValue({
      globalSpeedModifier: 100,
      curves: [{ id: 'c1', name: 'Silent', outputs: [{ id: 'lianli-wireless:998D1DE566E1:port0', type: 'fan' }] }],
    });
    await renderTab();
    expect(screen.getByText('Silent')).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
  });

  it('names the curve for a curve-driven port the provider reports as Manual', async () => {
    mockFetchCurves.mockResolvedValue({
      globalSpeedModifier: 100,
      curves: [
        { id: 'c1', name: 'Silent', outputs: [{ id: 'lianli-wireless:998D1DE566E1:port0', type: 'fan' }] },
        { id: 'c2', name: 'Turbo', outputs: [{ id: 'lianli-wireless:998D1DE566E1:port0', type: 'fan' }] },
      ],
    });
    await renderTab();
    expect(screen.getByText('Turbo')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.queryByText('cooling.card.manual')).not.toBeInTheDocument();
  });

  it('keeps the last full poll when a later curves fetch fails', async () => {
    mockFetchCurves
      .mockResolvedValueOnce({
        globalSpeedModifier: 100,
        curves: [{ id: 'c1', name: 'Silent', outputs: [{ id: 'lianli-wireless:998D1DE566E1:port0', type: 'fan' }] }],
      })
      .mockResolvedValue(null);
    await renderTab();
    expect(screen.getByText('Silent')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockFetchCurves).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Silent')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-wireless.fanN:{"n":1}')).toBeInTheDocument();
  });

  it('marks a port Nexus does not control', async () => {
    mockFetchFanChannels.mockResolvedValue({
      channels: [{ ...channelsFixture[0], controlled: false }, channelsFixture[1]],
    });
    await renderTab();
    expect(screen.getByText('cooling.fan.notControlled')).toBeInTheDocument();
    expect(screen.queryByText('cooling.card.manual')).not.toBeInTheDocument();
  });

  it('lists no ports for an unbound chain', async () => {
    await renderTab({ ...wirelessState, fans: [{ ...boundFan, boundToUs: false, slot: 0 }] });
    expect(screen.queryByText(/devices\.lianli-wireless\.fanN/)).not.toBeInTheDocument();
    expect(screen.queryByText('1,918 RPM')).not.toBeInTheDocument();
    expect(screen.queryByText('cooling.card.manual')).not.toBeInTheDocument();
  });

  it('polls the fan channels and curves on an interval', async () => {
    await renderTab();
    expect(mockFetchFanChannels).toHaveBeenCalledTimes(1);
    expect(mockFetchCurves).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockFetchFanChannels).toHaveBeenCalledTimes(2);
    expect(mockFetchCurves).toHaveBeenCalledTimes(2);
  });
});
