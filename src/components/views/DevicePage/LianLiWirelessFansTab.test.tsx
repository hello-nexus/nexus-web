import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
const mockSetLianLiWirelessLockBound = vi.fn();

vi.mock('../../../api/lianli-wireless', () => ({
  bindLianLiWirelessFan: (...args: any[]) => mockBindLianLiWirelessFan(...args),
  unbindLianLiWirelessFan: (...args: any[]) => mockUnbindLianLiWirelessFan(...args),
  identifyLianLiWirelessFan: (...args: any[]) => mockIdentifyLianLiWirelessFan(...args),
  setLianLiWirelessLockBound: (...args: any[]) => mockSetLianLiWirelessLockBound(...args),
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
  mockSetLianLiWirelessLockBound.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderTab(state: LianLiWirelessState | null = wirelessState) {
  const refresh = vi.fn().mockResolvedValue(undefined);
  await act(async () => {
    render(<LianLiWirelessFansTab state={state} refresh={refresh} />);
  });
  return refresh;
}

describe('LianLiWirelessFansTab', () => {
  it('renders bind/unbind/identify actions for a bound chain, with no speed controls', async () => {
    await renderTab();
    expect(screen.getAllByRole('switch').map(el => el.getAttribute('aria-label')))
      .toEqual(['devices.lianli-wireless.lockBoundDevices']);
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' })).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-wireless.bound - devices.lianli-wireless.slot:{"n":1}')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-wireless.fanTypeSlv3Lcd')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.fanTypeSlv3Lcd' })).not.toBeInTheDocument();
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
    expect(screen.getByText('devices.lianli-wireless.unbound')).toBeInTheDocument();
    expect(screen.queryByText(/devices\.lianli-wireless\.slot/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' })).toBeInTheDocument();
    expect(screen.getAllByRole('switch').map(el => el.getAttribute('aria-label')))
      .toEqual(['devices.lianli-wireless.lockBoundDevices']);
  });

  describe('lock bound devices toggle', () => {
    const lockSwitch = () => screen.getByRole('switch', { name: 'devices.lianli-wireless.lockBoundDevices' });

    it('reads on when the service omits the key and off when it reports false', async () => {
      await renderTab();
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'true');
      cleanup();
      await renderTab({ ...wirelessState, lockBoundDevices: false });
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'false');
    });

    it('flips optimistically and PUTs the new value', async () => {
      await renderTab({ ...wirelessState, lockBoundDevices: true });
      await act(async () => { fireEvent.click(lockSwitch()); });
      expect(mockSetLianLiWirelessLockBound).toHaveBeenCalledWith(false);
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'false');
    });

    it('renders unchecked and disabled before the state loads', async () => {
      await renderTab(null);
      expect(lockSwitch()).toBeDisabled();
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'false');
    });

    it('a failed earlier PUT does not wipe a later click, and only the last click persists', async () => {
      let failFirst: (ok: boolean) => void = () => {};
      mockSetLianLiWirelessLockBound.mockReturnValueOnce(new Promise<boolean>(r => { failFirst = r; }));
      await renderTab({ ...wirelessState, lockBoundDevices: true });
      await act(async () => { fireEvent.click(lockSwitch()); });
      await act(async () => { fireEvent.click(lockSwitch()); });
      await act(async () => { fireEvent.click(lockSwitch()); });
      await act(async () => { failFirst(false); });
      expect(mockSetLianLiWirelessLockBound.mock.calls).toEqual([[false], [false]]);
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'false');
    });

    it('keeps the toggle through a stale read sent before the PUT resolved', async () => {
      const refresh = vi.fn();
      const sentSeq = 5;
      let view: ReturnType<typeof render> | undefined;
      await act(async () => {
        view = render(<LianLiWirelessFansTab state={{ ...wirelessState, lockBoundDevices: true }} stateSeq={5} readSentSeq={() => sentSeq} refresh={refresh} />);
      });
      await act(async () => { fireEvent.click(lockSwitch()); });
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'false');
      // A read sent before the PUT resolved still says on: it must not flip the toggle back.
      await act(async () => {
        view!.rerender(<LianLiWirelessFansTab state={{ ...wirelessState, lockBoundDevices: true }} stateSeq={5} readSentSeq={() => sentSeq} refresh={refresh} />);
      });
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'false');
      // A read sent after it is authoritative.
      await act(async () => {
        view!.rerender(<LianLiWirelessFansTab state={{ ...wirelessState, lockBoundDevices: true }} stateSeq={6} readSentSeq={() => sentSeq} refresh={refresh} />);
      });
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'true');
    });

    it('a throwing PUT counts as failed, refreshes, and does not block the next click', async () => {
      mockSetLianLiWirelessLockBound.mockRejectedValueOnce(new Error('bad body'));
      const refresh = await renderTab({ ...wirelessState, lockBoundDevices: true });
      await act(async () => { fireEvent.click(lockSwitch()); });
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'true');
      expect(refresh).toHaveBeenCalled();
      await act(async () => { fireEvent.click(lockSwitch()); });
      expect(mockSetLianLiWirelessLockBound).toHaveBeenCalledTimes(2);
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'false');
    });

    it('reverts when the PUT fails', async () => {
      mockSetLianLiWirelessLockBound.mockResolvedValue(false);
      await renderTab({ ...wirelessState, lockBoundDevices: true });
      await act(async () => { fireEvent.click(lockSwitch()); });
      expect(mockSetLianLiWirelessLockBound).toHaveBeenCalledWith(false);
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'true');
    });
  });
});
