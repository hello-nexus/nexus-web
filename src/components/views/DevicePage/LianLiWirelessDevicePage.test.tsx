import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessDevicePage, fanTypeKey } from './LianLiWirelessDevicePage';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetLianLiWirelessState = vi.fn();

vi.mock('../../../api/lianli-wireless', () => ({
  getLianLiWirelessState: (...args: any[]) => mockGetLianLiWirelessState(...args),
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
  mockGetLianLiWirelessState.mockResolvedValue(connectedState);
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
});
