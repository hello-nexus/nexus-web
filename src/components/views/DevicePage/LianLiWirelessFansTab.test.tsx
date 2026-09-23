import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessFansTab } from './LianLiWirelessFansTab';
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
  mockBindLianLiWirelessFan.mockResolvedValue(true);
  mockUnbindLianLiWirelessFan.mockResolvedValue(true);
  mockIdentifyLianLiWirelessFan.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderTab(state: LianLiWirelessState | null = wirelessState, onSectionNavigate?: (s: string) => void) {
  const refresh = vi.fn().mockResolvedValue(undefined);
  await act(async () => {
    render(<LianLiWirelessFansTab state={state} refresh={refresh} onSectionNavigate={onSectionNavigate} />);
  });
  return refresh;
}

describe('LianLiWirelessFansTab - cooling controls', () => {
  it('renders each occupied port with its live RPM and channel mode in the same chain', async () => {
    await renderTab();

    expect(screen.getByText('devices.lianli-wireless.fanTypeSlv3Lcd')).toBeInTheDocument();
    expect(screen.getByText('1,918 RPM')).toBeInTheDocument();
    expect(screen.getByText('1,905 RPM')).toBeInTheDocument();

    const switches = screen.getAllByRole('switch', { name: 'devices.lianli-wireless.manualSpeed' });
    expect(switches).toHaveLength(2);
    expect(switches[0]).toHaveAttribute('aria-checked', 'true');
    expect(switches[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('greys out the speed slider of a port that follows the motherboard', async () => {
    await renderTab();
    const sliders = screen.getAllByRole('slider', { name: 'devices.lianli-wireless.fanSpeed' });
    expect(sliders).toHaveLength(2);
    expect(sliders[0]).not.toBeDisabled();
    expect(sliders[1]).toBeDisabled();
  });

  it('shows RPM but no mode controls for an unbound fan (no cooling channel registered)', async () => {
    await renderTab({ ...wirelessState, fans: [{ ...boundFan, boundToUs: false, slot: 0 }] });
    expect(screen.getByText('1,918 RPM')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'devices.lianli-wireless.manualSpeed' })).not.toBeInTheDocument();
  });

  it('renders bind/unbind/identify actions alongside the RPM and mode controls for the same chain', async () => {
    await renderTab();
    expect(screen.getAllByRole('switch', { name: 'devices.lianli-wireless.manualSpeed' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' })).toBeInTheDocument();
  });

  it('renders the header and bind/identify actions for a chain with fanCount 0, with no port rows', async () => {
    await renderTab({
      ...wirelessState,
      fans: [{
        mac: '112233445566',
        masterMac: '8A0EEF6232DC',
        boundToUs: false,
        channel: 8,
        slot: 2,
        devType: 5,
        fanType: 0,
        fanCount: 0,
        rpm: [0, 0, 0, 0],
        pwm: [0, 0, 0, 0],
      }],
    });
    expect(screen.getByText('devices.lianli-wireless.deviceStrimer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'devices.lianli-wireless.manualSpeed' })).not.toBeInTheDocument();
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

  it('turning on Manual speed calls setFanSpeed with the last known duty', async () => {
    await renderTab();

    fireEvent.click(screen.getAllByRole('switch', { name: 'devices.lianli-wireless.manualSpeed' })[1]);

    expect(mockSetFanSpeed).toHaveBeenCalledWith('lianli-wireless:998D1DE566E1:port1', 6);
  });

  it('turning off Manual speed hands the port to the motherboard', async () => {
    await renderTab();

    fireEvent.click(screen.getAllByRole('switch', { name: 'devices.lianli-wireless.manualSpeed' })[0]);

    expect(mockReleaseFanAuto).toHaveBeenCalledWith('lianli-wireless:998D1DE566E1:port0');
  });

  it('committing the manual slider drag calls setFanSpeed with the committed value', async () => {
    await renderTab();

    const slider = screen.getAllByRole('slider', { name: 'devices.lianli-wireless.fanSpeed' })[0];
    fireEvent.change(slider, { target: { value: '80' } });
    fireEvent.pointerUp(slider);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockSetFanSpeed).toHaveBeenCalledWith('lianli-wireless:998D1DE566E1:port0', 80);
  });

  it('shows a curve-active note instead of the speed controls when a port is Curve-driven', async () => {
    mockFetchFanChannels.mockResolvedValue({
      channels: [{ ...channelsFixture[0], mode: 'Curve' }, channelsFixture[1]],
    });
    await renderTab();
    expect(screen.getByText('devices.lianli-wireless.coolingCurveActive')).toBeInTheDocument();
    expect(screen.getAllByRole('switch', { name: 'devices.lianli-wireless.manualSpeed' })).toHaveLength(1);
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
