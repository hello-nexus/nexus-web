import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
const mockSync = vi.fn();
const mockSetSync = vi.fn();
const mockLightingGet = vi.fn();
const mockLightingSet = vi.fn();

vi.mock('../../../api/lianli-flex', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli-flex')>()),
  getLianLiFlexState: (...a: any[]) => mockState(...a),
  identifyLianLiFlexFan: (...a: any[]) => mockIdentify(...a),
  getLianLiFlexSync: (...a: any[]) => mockSync(...a),
  setLianLiFlexSync: (...a: any[]) => mockSetSync(...a),
  restartLianLiFlexLcd: (...a: any[]) => mockRestart(...a),
  lianLiFlexLightingApi: {
    get: (...a: any[]) => mockLightingGet(...a),
    set: (...a: any[]) => mockLightingSet(...a),
    reset: () => Promise.resolve(true),
  },
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
  mockSync.mockResolvedValue(null);
  mockSetSync.mockResolvedValue(true);
  mockLightingGet.mockResolvedValue(null);
  mockLightingSet.mockResolvedValue(true);
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
    expect(screen.getByText('devices.lianli-wireless.connectionSection')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-wireless.masterMac')).not.toBeInTheDocument();
    expect(screen.getByText('devices.lianli-flex.connectedByUsb')).toBeInTheDocument();
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

  it('shows the Screens tab for screens on USB whose fans run over the radio', async () => {
    mockState.mockResolvedValue({ isConnected: true, linkStatus: 'ok', fans: [], screenOnlySerials: ['SCR1', 'SCR2'] });
    await renderPage();
    expect(tab('devices.lianli-wireless.tab.screen')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-flex.notConnected')).not.toBeInTheDocument();
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

    it('keeps the pending state while the restarting screen is missing from the screens list', async () => {
      await openScreens();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.restartLcdButton' }));
      });
      mockScreens.mockResolvedValue([]);
      mockState.mockResolvedValue(connected([{ ...unit, lcdRestarting: true }]));
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(screen.getByRole('button', { name: 'devices.lianli-flex.restartingLcd' })).toBeDisabled();
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

  it('the Cooling shortcut opens the first fan on the Cooling page', async () => {
    const nav = vi.fn();
    await act(async () => { render(<LianLiWirelessDevicePage flex onSectionNavigate={nav} />); });
    await act(async () => { fireEvent.click(tab('cooling.title')); });
    fireEvent.click(screen.getByText('devices.coolingPage.setHint'));
    expect(nav).toHaveBeenCalledWith('cooling', expect.objectContaining({ coolingFanId: 'lianli-flex:AA11:port0' }));
  });

  it('names the screen tiles with the short fan names, TL first', async () => {
    const sl = { ...unit, mac: 'BB22', fanType: 43, family: 'slInfFlex', screenSerial: 'SCR2', sortIndex: 0 };
    mockState.mockResolvedValue(connected([sl, { ...unit, sortIndex: 1 }]));
    mockScreens.mockResolvedValue([
      { serial: 'SCR2', position: -1, width: 400, height: 400, brightness: 80, rotation: 0, contentType: 'off', label: 'Lian Li SL-INF LCD Flex Screen' },
      { serial: 'SCR1', position: -1, width: 400, height: 400, brightness: 80, rotation: 0, contentType: 'off', label: 'Lian Li TL LCD Flex Screen' },
    ]);
    await act(async () => { render(<LianLiWirelessDevicePage flex />); });
    await act(async () => { fireEvent.click(tab('devices.lianli-wireless.tab.screen')); });
    const tiles = within(screen.getByRole('group', { name: 'devices.lianli-wireless.screensAria' })).getAllByRole('button');
    expect(tiles.map(b => b.textContent)).toEqual(['devices.lianli-wireless.fanTypeTlFlex', 'devices.lianli-wireless.fanTypeSlInfFlex']);
  });
});

describe('moving a unit on the Lighting tab', () => {
  const modes = [{ key: 'rainbow', hasSpeed: true, hasDirection: true, colorsMin: 0, colorsMax: 0, mergeable: true }];
  const chain = (mac: string, fanType: number, sortIndex: number) => ({
    mac, kind: 'fans', devType: 0, model: '', fanType, fanCount: 1, lanes: 0, ledsPerLane: 0, modes, supportsPerLane: false,
    mode: 'rainbow', speed: 3, direction: 0, brightness: 4, colors: [], laneSettings: [], sortIndex,
  });
  const fan = (mac: string, fanType: number, family: string) => ({ ...unit, mac, fanType, family, screenSerial: '' });
  const syncData = {
    enabled: true, mode: 'rainbow', speed: 3, direction: 0, brightness: 4, colors: [], modes,
    members: [
      { mac: 'AA11', family: 'tlFlex', label: 'x', sortIndex: 0, sliceDirection: 0 },
      { mac: 'BB22', family: 'slInfFlex', label: 'x', sortIndex: 1, sliceDirection: 0 },
    ],
  };
  const dirLabels = () => screen.getAllByLabelText(/devices.lianli-flex.syncMemberDirection/).map(e => e.getAttribute('aria-label'));
  const TL = 'devices.lianli-flex.syncMemberDirection:{"fan":"devices.lianli-wireless.fanTypeTlFlex"}';
  const SL = 'devices.lianli-flex.syncMemberDirection:{"fan":"devices.lianli-wireless.fanTypeSlInfFlex"}';

  async function openLighting() {
    mockState.mockResolvedValue(connected([fan('AA11', 51, 'tlFlex'), fan('BB22', 43, 'slInfFlex')]));
    mockSync.mockResolvedValue(syncData);
    mockLightingGet.mockResolvedValue({ laneModes: [], chains: [chain('AA11', 51, 0), chain('BB22', 43, 1)] });
    await act(async () => { render(<LianLiWirelessDevicePage flex />); });
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /lighting.title/ })); });
  }
  const moveFirstRight = async () => {
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'devices.lianli-wireless.orderMoveRight' })[0]); });
  };

  it('sends the new order when a direction changes before the second write of the move resolves', async () => {
    const releases: Array<() => void> = [];
    await openLighting();
    mockLightingSet.mockImplementation(() => new Promise(resolve => { releases.push(() => resolve(true)); }));
    await moveFirstRight();
    expect(releases).toHaveLength(2);
    expect(dirLabels()).toEqual([SL, TL]);
    fireEvent.click(screen.getByLabelText(TL));
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'devices.lianli.directionRtl' })); });
    expect(mockSetSync).toHaveBeenCalledWith({ members: [{ mac: 'BB22', sliceDirection: 0 }, { mac: 'AA11', sliceDirection: 1 }] });
  });

  it('rolls the sync header back when a sortIndex write fails', async () => {
    await openLighting();
    mockLightingSet.mockResolvedValue(false);
    await moveFirstRight();
    expect(dirLabels()).toEqual([TL, SL]);
  });
});

describe('polling', () => {
  it('reads the sync group only while the Lighting tab is shown', async () => {
    await act(async () => { render(<LianLiWirelessDevicePage flex />); });
    expect(mockSync).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /lighting.title/ })); });
    expect(mockSync).toHaveBeenCalled();
    mockSync.mockClear();
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /devices.lianli-wireless.tab.devices/ })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('does not poll the wired state from the wireless page', async () => {
    mockWirelessState.mockResolvedValue({ isConnected: true, masterMac: 'M', channel: 8, txFirmwareVersion: 1, lockBoundDevices: false, fans: [] });
    await act(async () => { render(<LianLiWirelessDevicePage />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(mockState).not.toHaveBeenCalled();
  });
});

describe('the wireless page with wired LCD Flex units', () => {
  it('lists a unit the wired page owns as Connected by USB with a link, and no Bind', async () => {
    mockWirelessState.mockResolvedValue({
      isConnected: true, masterMac: 'M', channel: 8, txFirmwareVersion: 1, lockBoundDevices: false,
      fans: [{ mac: 'AA11', masterMac: '', boundToUs: false, channel: 0, slot: 254, devType: 0, fanType: 51, fanCount: 1, rpm: [0, 0, 0, 0], pwm: [0, 0, 0, 0], wiredOwned: true }],
    });
    const nav = vi.fn();
    await act(async () => { render(<LianLiWirelessDevicePage onSectionNavigate={nav} />); });
    expect(screen.getByText('devices.lianli-flex.connectedByUsb')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.bind' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.openWiredPage' }));
    expect(nav).toHaveBeenCalledWith('device', { deviceKey: 'curated-lianli-flex' });
  });
});
