import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessDevicePage } from './LianLiWirelessDevicePage';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: [], ready: true }),
}));

const mockState = vi.fn();
const mockIdentify = vi.fn();
const mockRestart = vi.fn();
const mockScreens = vi.fn();
const mockWirelessState = vi.fn();
const mockWirelessIdentify = vi.fn();

vi.mock('../../../api/lianli-flex', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli-flex')>()),
  getLianLiFlexState: (...a: any[]) => mockState(...a),
  identifyLianLiFlexFan: (...a: any[]) => mockIdentify(...a),
  restartLianLiFlexLcd: (...a: any[]) => mockRestart(...a),
  lianLiFlexLightingApi: { get: () => Promise.resolve(null), set: () => Promise.resolve(true), reset: () => Promise.resolve(true) },
  lianLiFlexScreenApi: {
    getScreens: (...a: any[]) => mockScreens(...a),
    setSettings: () => Promise.resolve(true),
    setOrder: () => Promise.resolve(true),
    setContent: () => Promise.resolve(true),
  },
}));

vi.mock('../../../api/lianli-wireless', () => ({
  getLianLiWirelessState: (...a: any[]) => mockWirelessState(...a),
  identifyLianLiWirelessFan: (...a: any[]) => mockWirelessIdentify(...a),
  bindLianLiWirelessFan: () => Promise.resolve(true),
  unbindLianLiWirelessFan: () => Promise.resolve(true),
  setLianLiWirelessLockBound: () => Promise.resolve(true),
  getLianLiWirelessLighting: () => Promise.resolve(null),
  setLianLiWirelessChainLighting: () => Promise.resolve(true),
  getLianLiWirelessScreens: () => Promise.resolve([]),
  getLianLiWirelessMedia: () => Promise.resolve([]),
  getLianLiAioScreen: () => Promise.resolve(null),
  setLianLiAioScreen: () => Promise.resolve(true),
}));

vi.mock('../../../api/panel', () => ({ fetchPanelDevices: () => Promise.resolve({ devices: [] }) }));

vi.mock('../../../api/cooling', () => ({
  fetchFanChannels: () => Promise.resolve({
    channels: [{ id: 'lianli-flex:AA11:port0', name: 'Flex', dutyPercent: 40, rpm: 661, mode: 'Manual' }],
  }),
  fetchCurves: () => Promise.resolve({ globalSpeedModifier: 100, curves: [] }),
}));

const unit = {
  mac: 'AA11', masterMac: '', boundToUs: true, channel: 0, slot: 254, devType: 0, fanType: 51, fanCount: 1,
  rpm: [661, 0, 0, 0], pwm: [40, 0, 0, 0], family: 'tlFlex', screenSerial: 'SCR1', lcdRestarting: false, receiverBound: false,
};

const connected = (fans: any[] = [unit]) => ({ isConnected: true, linkStatus: 'ok', fans });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockState.mockResolvedValue(connected());
  mockIdentify.mockResolvedValue(true);
  mockRestart.mockResolvedValue(true);
  mockScreens.mockResolvedValue([
    { serial: 'SCR1', position: -1, width: 400, height: 400, brightness: 80, rotation: 0, contentType: 'off', label: 'TL Flex' },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderPage() {
  await act(async () => {
    render(<LianLiWirelessDevicePage flex />);
  });
}

function tab(key: string) {
  return screen.getByRole('tab', { name: new RegExp(key) });
}

describe('LianLiWirelessDevicePage as the wired LCD Flex page', () => {
  it('reads the wired state, never the wireless one', async () => {
    await renderPage();
    expect(mockState).toHaveBeenCalled();
    expect(mockWirelessState).not.toHaveBeenCalled();
  });

  it('offers Devices, Lighting, Cooling and Screens for a unit under Nexus control', async () => {
    await renderPage();
    for (const label of ['devices.lianli-wireless.tab.devices', 'lighting.title', 'cooling.title', 'devices.lianli-wireless.tab.screen']) {
      expect(tab(label)).toBeInTheDocument();
    }
  });

  it('lists the unit with identify only: no bind, unbind or lock controls', async () => {
    await renderPage();
    expect(screen.getByText('devices.lianli-wireless.fanTypeTlFlex')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.bind' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.unbind' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'devices.lianli-wireless.lockBoundDevices' })).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-wireless.connectionSection')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' }));
    });
    expect(mockIdentify).toHaveBeenCalledWith('AA11');
    expect(mockWirelessIdentify).not.toHaveBeenCalled();
  });

  it('a unit bound to a wireless controller keeps only Devices and Screens', async () => {
    mockState.mockResolvedValue(connected([{ ...unit, boundToUs: false, receiverBound: true }]));
    await renderPage();
    expect(screen.getByText('devices.lianli-flex.boundElsewhere')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /lighting.title/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /cooling.title/ })).not.toBeInTheDocument();
    expect(tab('devices.lianli-wireless.tab.screen')).toBeInTheDocument();
  });

  it('has no Screens tab for a unit without a screen', async () => {
    mockState.mockResolvedValue(connected([{ ...unit, screenSerial: '' }]));
    await renderPage();
    expect(screen.queryByRole('tab', { name: /tab.screen/ })).not.toBeInTheDocument();
  });

  it('shows the Flex empty state and busy hint when another app holds the fans', async () => {
    mockState.mockResolvedValue({ isConnected: false, linkStatus: 'busy', fans: [] });
    await renderPage();
    expect(screen.getByText('devices.lianli-flex.notConnected')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-flex.linkBusy')).toBeInTheDocument();
  });

  it('Cooling lists the unit through its lianli-flex channel', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(tab('cooling.title')); });
    expect(screen.getByText('devices.lianli-wireless.fanN:{"n":1}')).toBeInTheDocument();
  });

  describe('Restart LCD', () => {
    async function openScreens() {
      await renderPage();
      await act(async () => { fireEvent.click(tab('devices.lianli-wireless.tab.screen')); });
    }

    it('posts the unit MAC, shows the pending state and returns once the service has restarted and finished', async () => {
      await openScreens();
      const button = () => screen.getByRole('button', { name: /devices.lianli-flex.restart(LcdButton|ingLcd)/ });
      expect(button()).toHaveTextContent('devices.lianli-flex.restartLcdButton');
      await act(async () => { fireEvent.click(button()); });
      expect(mockRestart).toHaveBeenCalledWith('AA11');
      expect(button()).toHaveTextContent('devices.lianli-flex.restartingLcd');
      expect(button()).toBeDisabled();

      mockState.mockResolvedValue(connected([{ ...unit, lcdRestarting: true }]));
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(button()).toHaveTextContent('devices.lianli-flex.restartingLcd');

      mockState.mockResolvedValue(connected());
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(button()).toHaveTextContent('devices.lianli-flex.restartLcdButton');
      expect(button()).not.toBeDisabled();
    });

    it('re-enables the button when the service refuses the restart', async () => {
      mockRestart.mockResolvedValue(false);
      await openScreens();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.restartLcdButton' }));
      });
      expect(screen.getByRole('button', { name: 'devices.lianli-flex.restartLcdButton' })).not.toBeDisabled();
    });

    it('gives up waiting when the state never shows the restart', async () => {
      await openScreens();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.restartLcdButton' }));
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
      expect(screen.getByRole('button', { name: 'devices.lianli-flex.restartLcdButton' })).not.toBeDisabled();
    });

    it('offers screen brightness and sleep-when-locked', async () => {
      await openScreens();
      expect(screen.getByRole('slider', { name: 'devices.lianli-wireless.brightness' })).toBeInTheDocument();
      expect(screen.getByText('devices.lcd.sleepWhenLocked')).toBeInTheDocument();
    });
  });
});
