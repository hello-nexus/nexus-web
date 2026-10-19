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
  lockBoundDevices: false,
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
    const on = { ...wirelessState, lockBoundDevices: true };
    const off = { ...wirelessState, lockBoundDevices: false };

    function deferred<T>() {
      let resolve: (v: T) => void = () => {};
      const promise = new Promise<T>(r => { resolve = r; });
      return { promise, resolve };
    }

    it('reads on when the service reports true and off when it reports false', async () => {
      await renderTab(on);
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'true');
      cleanup();
      await renderTab(off);
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'false');
    });

    it('hides the toggle and leaves binding enabled when the service omits the field', async () => {
      const unbound = { ...boundFan, mac: 'AABBCCDDEEFF', boundToUs: false };
      await renderTab({ ...wirelessState, lockBoundDevices: undefined, fans: [boundFan, unbound] });
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })).not.toBeDisabled();
    });

    it('disables bind and unbind and points them at the toggle description while locked', async () => {
      const unbound = { ...boundFan, mac: 'AABBCCDDEEFF', boundToUs: false };
      await renderTab({ ...on, fans: [boundFan, unbound] });
      const hint = screen.getByText('devices.lianli-wireless.lockBoundDevicesHint');
      for (const name of ['devices.lianli-wireless.unbind', 'devices.lianli-wireless.bind']) {
        const btn = screen.getByRole('button', { name });
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('aria-describedby', hint.id);
      }
      expect(hint.id).not.toBe('');
    });

    it('enables bind and unbind with no description link while unlocked', async () => {
      const unbound = { ...boundFan, mac: 'AABBCCDDEEFF', boundToUs: false };
      await renderTab({ ...off, fans: [boundFan, unbound] });
      for (const name of ['devices.lianli-wireless.unbind', 'devices.lianli-wireless.bind']) {
        const btn = screen.getByRole('button', { name });
        expect(btn).not.toBeDisabled();
        expect(btn).not.toHaveAttribute('aria-describedby');
      }
    });

    it('renders mixed and disabled, with no empty note, before the state loads', async () => {
      await renderTab(null);
      const toggle = screen.getByRole('checkbox', { name: 'devices.lianli-wireless.lockBoundDevices' });
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAttribute('aria-checked', 'mixed');
      expect(screen.queryByText('devices.lianli-wireless.noDevicesPaired')).not.toBeInTheDocument();
    });

    it('keeps bind and unbind disabled while a lock-off PUT is in flight', async () => {
      const put = deferred<boolean>();
      mockSetLianLiWirelessLockBound.mockReturnValueOnce(put.promise);
      const unbound = { ...boundFan, mac: 'AABBCCDDEEFF', boundToUs: false };
      await renderTab({ ...on, fans: [boundFan, unbound] });
      await act(async () => { fireEvent.click(lockSwitch()); });
      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })).toBeDisabled();
      await act(async () => { put.resolve(true); });
    });

    it('closes the unbind confirm when the lock turns on', async () => {
      let view: ReturnType<typeof render> | undefined;
      const refresh = vi.fn().mockResolvedValue(undefined);
      await act(async () => { view = render(<LianLiWirelessFansTab state={off} refresh={refresh} />); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' })); });
      expect(screen.getByText('devices.lianli-wireless.unbindConfirmTitle')).toBeInTheDocument();
      await act(async () => { view!.rerender(<LianLiWirelessFansTab state={on} refresh={refresh} />); });
      expect(screen.queryByText('devices.lianli-wireless.unbindConfirmTitle')).not.toBeInTheDocument();
    });

    it('clears the row pending state and refreshes when bind resolves false', async () => {
      mockBindLianLiWirelessFan.mockResolvedValue(false);
      const refresh = await renderTab({ ...off, fans: [{ ...boundFan, boundToUs: false }] });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })); });
      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })).not.toBeDisabled();
      expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.binding' })).not.toBeInTheDocument();
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('clears the row pending state and refreshes when unbind resolves false', async () => {
      mockUnbindLianLiWirelessFan.mockResolvedValue(false);
      const refresh = await renderTab(off);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' })); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.unbindConfirmLabel' })); });
      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.unbind' })).not.toBeDisabled();
      expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.unbinding' })).not.toBeInTheDocument();
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('clears the row pending state and refreshes when bind rejects', async () => {
      mockBindLianLiWirelessFan.mockRejectedValue(new Error('offline'));
      const refresh = await renderTab({ ...off, fans: [{ ...boundFan, boundToUs: false }] });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })); });
      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })).not.toBeDisabled();
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('shows the clicked value and is disabled while saving, then shows the server value after the refresh', async () => {
      const put = deferred<boolean>();
      const reread = deferred<void>();
      mockSetLianLiWirelessLockBound.mockReturnValueOnce(put.promise);
      const refresh = vi.fn().mockReturnValue(reread.promise);
      let view: ReturnType<typeof render> | undefined;
      await act(async () => { view = render(<LianLiWirelessFansTab state={on} refresh={refresh} />); });
      await act(async () => { fireEvent.click(lockSwitch()); });
      expect(mockSetLianLiWirelessLockBound).toHaveBeenCalledWith(false);
      expect(lockSwitch()).toBeDisabled();
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'false');
      await act(async () => { put.resolve(true); });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(lockSwitch()).toBeDisabled();
      await act(async () => {
        view!.rerender(<LianLiWirelessFansTab state={off} refresh={refresh} />);
        reread.resolve();
      });
      expect(lockSwitch()).not.toBeDisabled();
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'false');
    });

    it('shows the server value when it disagrees with the click', async () => {
      let view: ReturnType<typeof render> | undefined;
      const refresh = vi.fn().mockResolvedValue(undefined);
      await act(async () => { view = render(<LianLiWirelessFansTab state={on} refresh={refresh} />); });
      await act(async () => {
        fireEvent.click(lockSwitch());
        view!.rerender(<LianLiWirelessFansTab state={on} refresh={refresh} />);
      });
      expect(lockSwitch()).toBeDisabled();
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      expect(lockSwitch()).not.toBeDisabled();
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'true');
    });

    it('re-enables after the pending window when the refresh rejects', async () => {
      const refresh = vi.fn().mockRejectedValue(new Error('offline'));
      await act(async () => { render(<LianLiWirelessFansTab state={on} refresh={refresh} />); });
      await act(async () => { fireEvent.click(lockSwitch()); });
      expect(refresh).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      expect(lockSwitch()).not.toBeDisabled();
    });

    it('reverts to the server value when the PUT fails', async () => {
      mockSetLianLiWirelessLockBound.mockResolvedValue(false);
      const refresh = await renderTab(on);
      await act(async () => { fireEvent.click(lockSwitch()); });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(lockSwitch()).not.toBeDisabled();
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'true');
    });

    it('a throwing PUT does not leave the toggle disabled', async () => {
      mockSetLianLiWirelessLockBound.mockRejectedValueOnce(new Error('bad body'));
      const refresh = await renderTab(on);
      await act(async () => { fireEvent.click(lockSwitch()); });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(lockSwitch()).not.toBeDisabled();
      expect(lockSwitch()).toHaveAttribute('aria-checked', 'true');
    });
  });
});

describe('LianLiWirelessFansTab wired', () => {
  const wiredFan = { ...boundFan, masterMac: '', slot: 254, fanType: 51, fanCount: 1, lcdFirmware: '1.2' };

  it('lists a wired unit without bind, unbind or the controller link, and identifies through the given call', async () => {
    const identify = vi.fn().mockResolvedValue(true);
    await act(async () => {
      render(<LianLiWirelessFansTab state={{ isConnected: true, fans: [wiredFan] }} refresh={vi.fn()} wired identify={identify} />);
    });
    expect(screen.getByText('devices.lianli-flex.devicesSection')).toBeInTheDocument();
    // The wired unit gets its own Connection section, with the link status.
    expect(screen.getByText('devices.lianli-wireless.connectionSection')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-flex.link_ok')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-wireless.masterMac')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.unbind' })).not.toBeInTheDocument();
    expect(screen.getByText('devices.lianli-flex.connectedByUsb')).toBeInTheDocument();
    // Receiver and screen firmware are separate lines.
    const screenLine = screen.getByText(/devices.lianli-flex.lcdFirmware/);
    expect(screenLine.textContent).not.toMatch(/firmwareVersion/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' })); });
    expect(identify).toHaveBeenCalledWith(wiredFan.mac);
    expect(mockIdentifyLianLiWirelessFan).not.toHaveBeenCalled();
  });

  it('marks a unit bound to a wireless controller', async () => {
    await act(async () => {
      render(<LianLiWirelessFansTab state={{ isConnected: true, fans: [{ ...wiredFan, boundToUs: false, receiverBound: true }] }} refresh={vi.fn()} wired />);
    });
    expect(screen.getByText('devices.lianli-flex.boundElsewhere')).toBeInTheDocument();
  });

  it('shows the link status of a busy or missing wired unit', async () => {
    await act(async () => {
      render(<LianLiWirelessFansTab state={{ isConnected: false, linkStatus: 'busy', fans: [] }} refresh={vi.fn()} wired />);
    });
    expect(screen.getByText('devices.lianli-flex.link_busy')).toBeInTheDocument();
  });

  it('keeps Identify pending for a few seconds after a wired request returns', async () => {
    const identify = vi.fn().mockResolvedValue(true);
    await act(async () => {
      render(<LianLiWirelessFansTab state={{ isConnected: true, fans: [wiredFan] }} refresh={vi.fn()} wired identify={identify} />);
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' })); });
    expect(screen.getByRole('button', { name: 'devices.lianli-flex.identifying' })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' })).not.toBeDisabled();
  });

  it('shows Identify as pending while the service reports the unit identifying', async () => {
    await act(async () => {
      render(<LianLiWirelessFansTab state={{ isConnected: true, fans: [{ ...wiredFan, identifying: true }] }} refresh={vi.fn()} wired />);
    });
    expect(screen.getByRole('button', { name: 'devices.lianli-flex.identifying' })).toBeDisabled();
  });
});

describe('LianLiWirelessFansTab units owned by the wired page', () => {
  const flexFan = { ...boundFan, boundToUs: false, masterMac: '', slot: 254, fanType: 51, fanCount: 1 };

  it('says Connected by USB with a link to the LCD Flex page and offers no Bind or Identify', async () => {
    const open = vi.fn();
    await act(async () => {
      render(<LianLiWirelessFansTab
        state={{ ...wirelessState, fans: [flexFan] }}
        refresh={vi.fn()}
        wiredMacs={new Set([flexFan.mac])}
        onOpenWiredPage={open}
      />);
    });
    expect(screen.getByText('devices.lianli-flex.connectedByUsb')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.bind' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.identify' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.openWiredPage' }));
    expect(open).toHaveBeenCalled();
  });

  it('honors the service flag without the wired page state', async () => {
    await act(async () => {
      render(<LianLiWirelessFansTab state={{ ...wirelessState, fans: [{ ...flexFan, wiredOwned: true }] }} refresh={vi.fn()} />);
    });
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.bind' })).not.toBeInTheDocument();
  });

  it('still offers Bind for a unit the wired page does not own', async () => {
    await act(async () => {
      render(<LianLiWirelessFansTab state={{ ...wirelessState, fans: [flexFan] }} refresh={vi.fn()} wiredMacs={new Set()} />);
    });
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.bind' })).toBeInTheDocument();
  });
});
