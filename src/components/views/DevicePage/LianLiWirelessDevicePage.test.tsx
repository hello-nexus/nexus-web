import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessDevicePage } from './LianLiWirelessDevicePage';
import { fanTypeKey, deviceTypeKey, isFanDevice } from './LianLiWirelessFansTab';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetLianLiWirelessState = vi.fn();
const mockBindLianLiWirelessFan = vi.fn();
const mockUnbindLianLiWirelessFan = vi.fn();
const mockIdentifyLianLiWirelessFan = vi.fn();

vi.mock('../../../api/lianli-wireless', () => ({
  getLianLiWirelessState: (...args: any[]) => mockGetLianLiWirelessState(...args),
  bindLianLiWirelessFan: (...args: any[]) => mockBindLianLiWirelessFan(...args),
  unbindLianLiWirelessFan: (...args: any[]) => mockUnbindLianLiWirelessFan(...args),
  identifyLianLiWirelessFan: (...args: any[]) => mockIdentifyLianLiWirelessFan(...args),
}));

const connectedState = {
  isConnected: true,
  masterMac: '8A0EEF6232DC',
  channel: 8,
  txFirmwareVersion: 16,
  fans: [
    {
      mac: '998D1DE566E1',
      masterMac: '8A0EEF6232DC',
      boundToUs: true,
      channel: 8,
      slot: 1,
      devType: 0,
      fanType: 24,
      fanCount: 3,
      rpm: [1918, 1905, 1892, 0],
      pwm: [6, 6, 6, 6],
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockGetLianLiWirelessState.mockResolvedValue(connectedState);
  mockBindLianLiWirelessFan.mockResolvedValue(true);
  mockUnbindLianLiWirelessFan.mockResolvedValue(true);
  mockIdentifyLianLiWirelessFan.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fanTypeKey', () => {
  it('maps 24 to SLV3-LCD', () => {
    expect(fanTypeKey(24)).toBe('fanTypeSlv3Lcd');
  });

  it('maps 20-23 to SLV3-LED', () => {
    expect(fanTypeKey(20)).toBe('fanTypeSlv3Led');
    expect(fanTypeKey(23)).toBe('fanTypeSlv3Led');
  });

  it('maps 36-39 to SL-Infinity', () => {
    expect(fanTypeKey(36)).toBe('fanTypeSlInfinity');
    expect(fanTypeKey(39)).toBe('fanTypeSlInfinity');
  });

  it('falls back to a generic fan label', () => {
    expect(fanTypeKey(0)).toBe('fanTypeGeneric');
    expect(fanTypeKey(99)).toBe('fanTypeGeneric');
  });

  it('maps 27-35 to TL-V2', () => {
    expect(fanTypeKey(27)).toBe('fanTypeTlv2');
    expect(fanTypeKey(28)).toBe('fanTypeTlv2');
    expect(fanTypeKey(35)).toBe('fanTypeTlv2');
  });
});

describe('deviceTypeKey', () => {
  it('names a Strimer from dev_type 1-9', () => {
    expect(deviceTypeKey(1, 0)).toBe('deviceStrimer');
    expect(deviceTypeKey(9, 0)).toBe('deviceStrimer');
  });

  it('names a Water Block from dev_type 10/11', () => {
    expect(deviceTypeKey(10, 0)).toBe('deviceWaterBlock');
    expect(deviceTypeKey(11, 0)).toBe('deviceWaterBlock');
  });

  it('names a fan chain by its sub-family (dev_type 0, sub-family in fanType)', () => {
    expect(deviceTypeKey(0, 24)).toBe('fanTypeSlv3Lcd');
    expect(deviceTypeKey(0, 36)).toBe('fanTypeSlInfinity');
    expect(deviceTypeKey(0, 0)).toBe('fanTypeGeneric');
  });

  it('falls back to a generic device label for unknown categories', () => {
    expect(deviceTypeKey(15, 0)).toBe('deviceGeneric');
    expect(deviceTypeKey(90, 0)).toBe('deviceGeneric');
  });

  it('isFanDevice: dev_type 0 and 20-42 are fans, others are not', () => {
    expect(isFanDevice(0)).toBe(true);
    expect(isFanDevice(20)).toBe(true);
    expect(isFanDevice(42)).toBe(true);
    expect(isFanDevice(5)).toBe(false);
    expect(isFanDevice(10)).toBe(false);
  });
});

describe('LianLiWirelessDevicePage', () => {
  it('renders connection info and the fan chain with live RPM', async () => {
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });
    expect(screen.getByText('devices.lianli-wireless.connectionSection')).toBeInTheDocument();
    expect(screen.getByText('8A0EEF6232DC')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-wireless.fanTypeSlv3Lcd')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-wireless.fanN:{"n":1}')).toBeInTheDocument();
    expect(screen.getByText('1,918 RPM')).toBeInTheDocument();
    // Only the first fanCount (3) rpm entries render, not the trailing 0.
    expect(screen.queryByText('devices.lianli-wireless.fanN:{"n":4}')).not.toBeInTheDocument();
  });

  it('shows the bound badge for a fan bound to us', async () => {
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });
    expect(screen.getByText('devices.lianli-wireless.bound')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-wireless.unbound')).not.toBeInTheDocument();
  });

  it('renders disconnected placeholder when not connected', async () => {
    mockGetLianLiWirelessState.mockResolvedValue({
      isConnected: false,
      masterMac: '',
      channel: 0,
      txFirmwareVersion: 0,
      fans: [],
    });
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });
    expect(screen.getByText('devices.lianli-wireless.notConnected')).toBeInTheDocument();
  });

  it('shows the empty-fans note when connected but nothing is paired', async () => {
    mockGetLianLiWirelessState.mockResolvedValue({
      ...connectedState,
      fans: [],
    });
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });
    expect(screen.getByText('devices.lianli-wireless.noFansPaired')).toBeInTheDocument();
  });

  it('names a non-fan device (Strimer) and shows no fan rows', async () => {
    mockGetLianLiWirelessState.mockResolvedValue({
      ...connectedState,
      fans: [{
        mac: '112233445566',
        masterMac: '8A0EEF6232DC',
        boundToUs: true,
        channel: 8,
        slot: 2,
        devType: 5,   // a Strimer
        fanType: 0,
        fanCount: 0,
        rpm: [0, 0, 0, 0],
        pwm: [0, 0, 0, 0],
      }],
    });
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });
    expect(screen.getByText('devices.lianli-wireless.deviceStrimer')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-wireless.fanN:{"n":1}')).not.toBeInTheDocument();
  });
});

const unboundFan = {
  ...connectedState.fans[0],
  mac: 'AABBCCDDEEFF',
  boundToUs: false,
  slot: 0,
};

describe('LianLiWirelessDevicePage - bind/unbind/identify', () => {
  it('shows Bind for an unbound fan and Unbind for a bound fan, both with Identify', async () => {
    mockGetLianLiWirelessState.mockResolvedValue({
      ...connectedState,
      fans: [connectedState.fans[0], unboundFan],
    });
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'devices.lianli-wireless.identify' })).toHaveLength(2);
  });

  it('clicking Bind calls the API and shows a pending state until the poll confirms it bound', async () => {
    mockGetLianLiWirelessState.mockResolvedValue({ ...connectedState, fans: [unboundFan] });
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' }));
    expect(mockBindLianLiWirelessFan).toHaveBeenCalledWith(unboundFan.mac);

    const pendingButton = screen.getByRole('button', { name: 'devices.lianli-wireless.binding' });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' })).toBeDisabled();

    mockGetLianLiWirelessState.mockResolvedValue({
      ...connectedState,
      fans: [{ ...unboundFan, boundToUs: true, slot: 1 }],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.binding' })).not.toBeInTheDocument();
  });

  it('clears the pending state after the timeout if the poll never confirms it', async () => {
    mockGetLianLiWirelessState.mockResolvedValue({ ...connectedState, fans: [unboundFan] });
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' }));
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.binding' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })).not.toBeDisabled();
  });

  it('clicking Unbind opens a confirm dialog and does not call the API until confirmed', async () => {
    mockGetLianLiWirelessState.mockResolvedValue({ ...connectedState, fans: [connectedState.fans[0]] });
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' }));
    const dialog = screen.getByRole('alertdialog', { name: 'devices.lianli-wireless.unbindConfirmTitle' });
    expect(within(dialog).getByText('devices.lianli-wireless.unbindConfirmMessage')).toBeInTheDocument();
    expect(mockUnbindLianLiWirelessFan).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'confirm.cancel' }));
    expect(mockUnbindLianLiWirelessFan).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('confirming Unbind calls the API and shows a pending state until the poll confirms it unbound', async () => {
    mockGetLianLiWirelessState.mockResolvedValue({ ...connectedState, fans: [connectedState.fans[0]] });
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' }));
    const dialog = screen.getByRole('alertdialog', { name: 'devices.lianli-wireless.unbindConfirmTitle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'devices.lianli-wireless.unbindConfirmLabel' }));

    expect(mockUnbindLianLiWirelessFan).toHaveBeenCalledWith(connectedState.fans[0].mac);
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.unbinding' })).toBeDisabled();

    mockGetLianLiWirelessState.mockResolvedValue({
      ...connectedState,
      fans: [{ ...connectedState.fans[0], boundToUs: false, slot: 0 }],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })).toBeInTheDocument();
  });

  it('clicking Identify calls the API for that fan', async () => {
    mockGetLianLiWirelessState.mockResolvedValue({ ...connectedState, fans: [connectedState.fans[0]] });
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' }));
    expect(mockIdentifyLianLiWirelessFan).toHaveBeenCalledWith(connectedState.fans[0].mac);
  });
});

describe('LianLiWirelessDevicePage - tabs', () => {
  it('renders both tabs with Fans active by default', async () => {
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });

    expect(screen.getByRole('tab', { name: /devices\.lianli-wireless\.tab\.fans/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /devices\.lianli-wireless\.tab\.screen/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /devices\.lianli-wireless\.tab\.cooling/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /devices\.lianli-wireless\.tab\.lighting/ })).not.toBeInTheDocument();
    expect(screen.getByText('devices.lianli-wireless.connectionSection')).toBeInTheDocument();
  });

  it('keeps a pending bind across a transient disconnect/reconnect blip', async () => {
    mockGetLianLiWirelessState.mockResolvedValue({ ...connectedState, fans: [unboundFan] });
    await act(async () => {
      render(<LianLiWirelessDevicePage />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' }));
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.binding' })).toBeInTheDocument();

    mockGetLianLiWirelessState.mockResolvedValue({
      isConnected: false,
      masterMac: '',
      channel: 0,
      txFirmwareVersion: 0,
      fans: [],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText('devices.lianli-wireless.notConnected')).toBeInTheDocument();

    mockGetLianLiWirelessState.mockResolvedValue({ ...connectedState, fans: [unboundFan] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.binding' })).toBeInTheDocument();
  });
});
