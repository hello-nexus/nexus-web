import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiDevicePage } from './LianLiDevicePage';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetLianLiState = vi.fn();
const mockGetLianLiLighting = vi.fn();
const mockSetLianLiLighting = vi.fn();
const mockSetLianLiFanCount = vi.fn();

vi.mock('../../../api/lianli', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli')>()),
  getLianLiState: (...args: any[]) => mockGetLianLiState(...args),
  getLianLiLighting: (...args: any[]) => mockGetLianLiLighting(...args),
  setLianLiLighting: (...args: any[]) => mockSetLianLiLighting(...args),
  setLianLiFanCount: (...args: any[]) => mockSetLianLiFanCount(...args),
}));

const mockSetDeviceChain = vi.fn();
const mockFetchDeviceStructure = vi.fn();

vi.mock('../../../api/lighting', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lighting')>()),
  setDeviceChain: (...args: any[]) => mockSetDeviceChain(...args),
  fetchDeviceStructure: (...args: any[]) => mockFetchDeviceStructure(...args),
}));

const mockFetchFanChannels = vi.fn();

vi.mock('../../../api/cooling', () => ({
  fetchFanChannels: (...args: any[]) => mockFetchFanChannels(...args),
  fetchCurves: () => Promise.resolve({ globalSpeedModifier: 100, curves: [] }),
}));

const defaultState = {
  isConnected: true,
  rpm: [1200, 900, 0, 0],
  fansPerPort: [3, 2, 0, 0],
};

const defaultLighting = {
  mode: 'static',
  speed: 2,
  direction: 0,
  brightness: 3,
  colors: ['#ff0000'],
  modes: [
    { key: 'static', label: 'Static', hasSpeed: true, hasDirection: false, hasBrightness: true, colorsMin: 1, colorsMax: 6 },
    { key: 'rainbowWave', label: 'Rainbow Wave', hasSpeed: true, hasDirection: true, hasBrightness: true, colorsMin: 0, colorsMax: 0 },
    { key: 'dualColor', label: 'Dual Color', hasSpeed: false, hasDirection: false, hasBrightness: true, colorsMin: 2, colorsMax: 2 },
    { key: 'custom', label: 'Custom (per-LED effects)', hasSpeed: false, hasDirection: false, hasBrightness: false, colorsMin: 0, colorsMax: 0 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockGetLianLiState.mockResolvedValue(defaultState);
  mockGetLianLiLighting.mockResolvedValue(defaultLighting);
  mockSetLianLiLighting.mockResolvedValue(null);
  mockSetLianLiFanCount.mockResolvedValue(null);
  mockSetDeviceChain.mockResolvedValue({ error: false, ledCount: 60, zoneIds: [] });
  mockFetchDeviceStructure.mockResolvedValue({ id: 'x', name: 'x', chain: [] });
  mockSetLianLiLighting.mockResolvedValue({ error: false });
  mockFetchFanChannels.mockResolvedValue({
    channels: [
      { id: 'lianli:port0', name: 'SL-Infinity Port 1', dutyPercent: 40, rpm: 1200, mode: 'Manual' },
      { id: 'lianli:port1', name: 'SL-Infinity Port 2', dutyPercent: 0, rpm: 900, mode: 'Auto' },
    ],
  });
});

async function renderOnLighting(ui: ReactElement) {
  await act(async () => {
    render(ui);
  });
  fireEvent.click(screen.getByRole('tab', { name: /lighting\.title/ }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('LianLiDevicePage', () => {
  it('opens on Devices with the per-port fan-count setup', async () => {
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    expect(screen.getByRole('tab', { name: /devices\.title/ })).toHaveAttribute('aria-selected', 'true');
    const portSection = screen.getByText('devices.lianli.portsSection').closest('section')!;
    for (let n = 1; n <= 4; n++) {
      expect(within(portSection).getByRole('button', { name: `devices.lianli.fanCountAria:{"n":${n}}` })).toBeInTheDocument();
    }
    expect(screen.queryByText('devices.lianli.lightingSection')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /cooling\.title/ })).toBeInTheDocument();
  });

  it('Cooling lists the ports with fans read-only and pins the Cooling shortcut to the header, Lighting its own', async () => {
    const nav = vi.fn();
    await act(async () => {
      render(<LianLiDevicePage onSectionNavigate={nav} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /cooling\.title/ }));
    });
    expect(screen.getByText('devices.lianli.port:{"n":1}')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli.port:{"n":2}')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.port:{"n":3}')).not.toBeInTheDocument();
    expect(screen.getByText('cooling.card.manual')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('cooling.card.bios')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /devices\.lianli\.fanCountAria/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'devices.coolingPage.setHint' }));
    expect(nav).toHaveBeenCalledWith('cooling', { scrollAnchors: ['cooling-group:lianli'] });

    fireEvent.click(screen.getByRole('tab', { name: /lighting\.title/ }));
    expect(screen.queryByRole('button', { name: 'devices.coolingPage.setHint' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lightingPage.setHint' }));
    expect(nav).toHaveBeenLastCalledWith('lighting', { scrollAnchors: ['lighting-group:mb:lianli'] });
  });

  it('a second hub reads and writes through its own id, channels and anchors', async () => {
    mockFetchFanChannels.mockResolvedValue({
      channels: [
        { id: 'lianli:port0', name: 'SL-Infinity Port 1', dutyPercent: 40, rpm: 1200, mode: 'Manual' },
        { id: 'lianli2:port0', name: 'SL-Infinity 2 Port 1', dutyPercent: 70, rpm: 1500, mode: 'Manual' },
      ],
    });
    const nav = vi.fn();
    await act(async () => {
      render(<LianLiDevicePage hubId="lianli2" onSectionNavigate={nav} />);
    });
    expect(mockGetLianLiState).toHaveBeenCalledWith('lianli2');
    expect(mockGetLianLiLighting).toHaveBeenCalledWith('lianli2');
    expect(screen.getByRole('tablist', { name: 'Lian Li Uni Hub 2' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.fanCountAria:{"n":3}' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli.fanCount2' }));
    });
    expect(mockSetLianLiFanCount).toHaveBeenCalledWith(2, 2, 'lianli2');

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /cooling\.title/ }));
    });
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.queryByText('40%')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'devices.coolingPage.setHint' }));
    expect(nav).toHaveBeenCalledWith('cooling', { scrollAnchors: ['cooling-group:lianli2'] });

    fireEvent.click(screen.getByRole('tab', { name: /lighting\.title/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.lightingPage.use' }));
    });
    expect(mockSetLianLiLighting).toHaveBeenCalledWith({ mode: 'custom' }, 'lianli2');
  });

  it('has no Cooling tab while no port has fans', async () => {
    mockGetLianLiState.mockResolvedValue({ ...defaultState, fansPerPort: [0, 0, 0, 0] });
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    expect(screen.queryByRole('tab', { name: /cooling\.title/ })).not.toBeInTheDocument();
  });

  it('firmware mode shows brightness slider first, then speed slider', async () => {
    await renderOnLighting(<LianLiDevicePage />);
    // In static mode (firmware), brightness should appear as a stacked slider label.
    expect(screen.getByText('devices.lianli.lightingBrightness')).toBeInTheDocument();
    // Speed also appears (static hasSpeed=true).
    expect(screen.getByText('devices.lianli.lightingSpeed')).toBeInTheDocument();
    // Verify brightness comes before speed in the DOM.
    const brightness = screen.getByText('devices.lianli.lightingBrightness');
    const speed = screen.getByText('devices.lianli.lightingSpeed');
    expect(brightness.compareDocumentPosition(speed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Lighting page mode turns the switch on and greys out the animation it will return to', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'custom',
      effectMode: 'rainbowWave',
    });
    await renderOnLighting(<LianLiDevicePage onSectionNavigate={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'devices.lightingPage.use' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'smartLights.colorOnLightingPage' })).toBeInTheDocument();
    const modeSelect = screen.getByRole('button', { name: 'devices.lianli.lightingMode' });
    expect(modeSelect).toHaveTextContent('Rainbow Wave');
    expect(modeSelect).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'devices.lianli.lightingSpeedAria' })).toBeDisabled();
  });

  it('turning the switch off restores the last animation', async () => {
    mockGetLianLiLighting.mockResolvedValue({ ...defaultLighting, mode: 'custom', effectMode: 'rainbowWave' });
    await renderOnLighting(<LianLiDevicePage />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.lightingPage.use' }));
    });
    expect(mockSetLianLiLighting).toHaveBeenCalledWith({ mode: 'rainbowWave' }, 'lianli');
  });

  it('offers Merge only for a mergeable mode and commits the toggle', async () => {
    await renderOnLighting(<LianLiDevicePage />);
    expect(screen.queryByRole('switch', { name: 'devices.lianli.merge' })).not.toBeInTheDocument();

    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'runway',
      merge: false,
      modes: [
        ...defaultLighting.modes,
        { key: 'runway', label: 'Runway', hasSpeed: true, hasDirection: false, hasBrightness: true, colorsMin: 0, colorsMax: 2, mergeable: true },
      ],
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    const toggle = screen.getByRole('switch', { name: 'devices.lianli.merge' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(mockSetLianLiLighting).toHaveBeenCalledWith({ merge: true }, 'lianli');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('turning the switch on hands the hub to the Lighting page', async () => {
    await renderOnLighting(<LianLiDevicePage />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.lightingPage.use' }));
    });
    expect(mockSetLianLiLighting).toHaveBeenCalledWith({ mode: 'custom' }, 'lianli');
  });

  it('shows the hub firmware version once the service has read it', async () => {
    mockGetLianLiState.mockResolvedValue({ ...defaultState, firmwareVersion: '1.4' });
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    expect(screen.getByText('devices.lianli.firmware')).toBeInTheDocument();
    expect(screen.getByText('1.4')).toBeInTheDocument();
  });

  it('offers fan counts up to the hub family\'s cap', async () => {
    mockGetLianLiState.mockResolvedValue({ ...defaultState, maxFansPerPort: 6 });
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.fanCountAria:{"n":1}' }));
    expect(screen.getByRole('option', { name: 'devices.lianli.fanCount6' })).toBeInTheDocument();
  });

  it('caps fan counts at four on a service that does not report the cap', async () => {
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.fanCountAria:{"n":1}' }));
    expect(screen.getByRole('option', { name: 'devices.lianli.fanCount4' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'devices.lianli.fanCount5' })).not.toBeInTheDocument();
  });

  it('a mode with no colours chosen shows its default palette without saving it', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'meteor',
      colors: [],
      modes: [
        ...defaultLighting.modes,
        { key: 'meteor', label: 'Meteor', hasSpeed: true, hasDirection: false, hasBrightness: true, colorsMin: 0, colorsMax: 4, defaultColors: ['#FF0000', '#0000FF'] },
      ],
    });
    await renderOnLighting(<LianLiDevicePage />);
    expect(screen.getAllByRole('button', { name: 'devices.lianli.removeColor' })).toHaveLength(2);
    expect(mockSetLianLiLighting).not.toHaveBeenCalled();
  });

  it('keeps the last colour of a mode with defaults', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'meteor',
      colors: ['#00FF00'],
      modes: [
        ...defaultLighting.modes,
        { key: 'meteor', label: 'Meteor', hasSpeed: true, hasDirection: false, hasBrightness: true, colorsMin: 0, colorsMax: 4, defaultColors: ['#FF0000', '#0000FF'] },
      ],
    });
    await renderOnLighting(<LianLiDevicePage />);
    expect(screen.queryByRole('button', { name: 'devices.lianli.removeColor' })).not.toBeInTheDocument();
  });

  it('switching modes saves only the mode', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      colors: [],
      modes: [
        ...defaultLighting.modes,
        { key: 'tide', label: 'Tide', hasSpeed: true, hasDirection: false, hasBrightness: true, colorsMin: 0, colorsMax: 2, defaultColors: ['#FF0000', '#0000FF'] },
      ],
    });
    await renderOnLighting(<LianLiDevicePage />);
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.lightingMode' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Tide' }));
    });
    expect(mockSetLianLiLighting).toHaveBeenCalledWith({ mode: 'tide' }, 'lianli');
  });

  it('keeps the Lighting page mode out of the animation list', async () => {
    await renderOnLighting(<LianLiDevicePage />);
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.lightingMode' }));
    const options = screen.getAllByRole('option');
    expect(options.map(o => o.textContent)).not.toContain('Custom (per-LED effects)');
  });

  it('firmware mode does NOT show lighting-page link button', async () => {
    const spy = vi.fn();
    await renderOnLighting(<LianLiDevicePage onSectionNavigate={spy} />);
    // defaultLighting.mode is 'static' (a firmware mode).
    expect(screen.queryByRole('button', { name: /smartLights\.colorOnLightingPage/i })).not.toBeInTheDocument();
  });

  it('rainbowWave mode shows direction select but no color pickers', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'rainbowWave',
    });
    await renderOnLighting(<LianLiDevicePage />);
    expect(screen.getByText('devices.lianli.lightingDirection')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.addColor')).not.toBeInTheDocument();
  });

  it('colorsMax===2 mode renders exactly 2 HsvPickers with Color 1 / Color 2 labels', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'dualColor',
      colors: ['#ff0000'],
    });
    await renderOnLighting(<LianLiDevicePage />);
    const section = screen.getByText('devices.lianli.lightingSection').closest('section')!;
    // Each HsvPicker renders one hex input; the fixed 2-color pair shows exactly two.
    expect(within(section).getAllByLabelText('common.hexColor')).toHaveLength(2);
    // Color labels are present.
    expect(within(section).getByText('devices.lianli.colorN:{"n":1}')).toBeInTheDocument();
    expect(within(section).getByText('devices.lianli.colorN:{"n":2}')).toBeInTheDocument();
    // No add/remove controls in the fixed 2-color pair.
    expect(within(section).queryByText('devices.lianli.addColor')).not.toBeInTheDocument();
    expect(within(section).queryByText('devices.lianli.removeColor')).not.toBeInTheDocument();
  });

  it('custom mode link navigates to lighting page', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'custom',
    });
    const spy = vi.fn();
    await renderOnLighting(<LianLiDevicePage onSectionNavigate={spy} />);
    const btn = screen.getByRole('button', { name: 'smartLights.colorOnLightingPage' });
    btn.click();
    expect(spy).toHaveBeenCalledWith('lighting');
  });

  describe('ARGB sync', () => {
    const sources = [{ id: 'openrgb-1', name: 'Header 1' }, { id: 'smarthub:1:port4', name: 'SmartHub Port 4' }];
    const product = { key: 'product:lianli-lian-li-sl120-infinity' };
    const argb = (extra: Record<string, unknown>) =>
      mockGetLianLiLighting.mockResolvedValue({ ...defaultLighting, argbSyncSupported: true, argbSync: false, argbSyncSource: null, argbSyncSources: sources, ...extra });
    const toggle = () => screen.getByRole('switch', { name: 'devices.lianli.argbSync' });

    it('with sync off, the Lighting shortcut targets the hub group', async () => {
      const nav = vi.fn();
      argb({ argbSyncSource: 'openrgb-s-9876543210-1' });
      await renderOnLighting(<LianLiDevicePage onSectionNavigate={nav} />);
      fireEvent.click(screen.getByRole('button', { name: 'devices.lightingPage.setHint' }));
      expect(nav).toHaveBeenLastCalledWith('lighting', { scrollAnchors: ['lighting-group:mb:lianli'] });
    });

    it('with sync on, the Lighting shortcut targets the source header instead of the hub', async () => {
      const nav = vi.fn();
      argb({ argbSync: true, argbSyncSource: 'openrgb-s-9876543210-1' });
      await renderOnLighting(<LianLiDevicePage onSectionNavigate={nav} />);
      fireEvent.click(screen.getByRole('button', { name: 'devices.lightingPage.setHint' }));
      expect(nav).toHaveBeenLastCalledWith('lighting', {
        scrollAnchors: [
          'lighting-group:mb:openrgb-s-9876543210-1',
          'lighting-device:openrgb-s-9876543210-1:z0',
          'lighting-device:openrgb-s-9876543210-1',
          'lighting-group:mb:openrgb-s-9876543210',
          'lighting-group:mb:lianli',
        ],
      });
    });

    it('is absent on a service that cannot sync this hub', async () => {
      argb({ argbSyncSupported: false });
      await renderOnLighting(<LianLiDevicePage />);
      expect(screen.queryByText('devices.lianli.argbSyncSection')).not.toBeInTheDocument();
    });

    it('on a hub with an unverified input layout, the switch alone hands the fans to the motherboard', async () => {
      argb({ argbSyncSourcesSupported: false, argbSyncSources: [] });
      await renderOnLighting(<LianLiDevicePage />);

      await act(async () => {
        fireEvent.click(screen.getByRole('switch', { name: 'devices.motherboardArgb.label' }));
      });

      expect(mockSetLianLiLighting).toHaveBeenCalledWith({ argbSync: true }, 'lianli');
      expect(mockSetDeviceChain).not.toHaveBeenCalled();
      expect(screen.queryByText('devices.lianli.argbSyncSource')).not.toBeInTheDocument();
    });

    it('with no header saved, switching on shows the picker and the pick turns sync on', async () => {
      argb({});
      await renderOnLighting(<LianLiDevicePage />);
      const picker = () => screen.queryByRole('button', { name: 'devices.lianli.argbSyncSource' });
      expect(picker()).not.toBeInTheDocument();
      fireEvent.click(toggle());
      expect(picker()).toHaveTextContent('devices.lianli.argbSyncChoose');
      expect(mockSetLianLiLighting).not.toHaveBeenCalled();
      fireEvent.click(picker()!);
      await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'Header 1' })); });
      expect(mockSetDeviceChain).toHaveBeenCalledWith('openrgb-1', [product, product, product]);
      expect(mockSetLianLiLighting).toHaveBeenCalledWith({ argbSync: true, argbSyncSource: 'openrgb-1' }, 'lianli');
      expect(toggle()).toHaveAttribute('aria-checked', 'true');
    });

    it('switching back off before a pick saves nothing', async () => {
      argb({});
      await renderOnLighting(<LianLiDevicePage />);
      fireEvent.click(toggle());
      fireEvent.click(toggle());
      expect(screen.queryByRole('button', { name: 'devices.lianli.argbSyncSource' })).not.toBeInTheDocument();
      expect(mockSetLianLiLighting).not.toHaveBeenCalled();
    });

    it('cannot be switched on with no header to play', async () => {
      argb({ argbSyncSources: [] });
      await renderOnLighting(<LianLiDevicePage />);
      expect(toggle()).toBeDisabled();
    });

    it('turning it on wires one fan layout per fan of the longest port, then saves the source', async () => {
      argb({ argbSyncSource: 'openrgb-1' });
      await renderOnLighting(<LianLiDevicePage />);
      await act(async () => { fireEvent.click(toggle()); });
      expect(mockSetDeviceChain).toHaveBeenCalledWith('openrgb-1', [product, product, product]);
      expect(mockSetLianLiLighting).toHaveBeenCalledWith({ argbSync: true, argbSyncSource: 'openrgb-1' }, 'lianli');
      expect(mockSetDeviceChain.mock.invocationCallOrder[0]).toBeLessThan(mockSetLianLiLighting.mock.invocationCallOrder[0]);
    });

    it('does not rewire a header that already carries exactly that chain', async () => {
      argb({ argbSyncSource: 'openrgb-1' });
      mockFetchDeviceStructure.mockResolvedValue({ id: 'openrgb-1', name: 'Header 1', chain: [1, 2, 3].map(() => ({ ...product, name: 'SL120', ledCount: 20, editableCount: false })) });
      await renderOnLighting(<LianLiDevicePage />);
      await act(async () => { fireEvent.click(toggle()); });
      expect(mockSetDeviceChain).not.toHaveBeenCalled();
      expect(mockSetLianLiLighting).toHaveBeenCalledWith({ argbSync: true, argbSyncSource: 'openrgb-1' }, 'lianli');
    });

    it('a refused chain leaves sync off and saves nothing', async () => {
      argb({ argbSyncSource: 'openrgb-1' });
      mockSetDeviceChain.mockResolvedValue({ error: true, msg: 'chain is longer than the port carries' });
      await renderOnLighting(<LianLiDevicePage />);
      await act(async () => { fireEvent.click(toggle()); });
      expect(mockSetLianLiLighting).not.toHaveBeenCalled();
      expect(toggle()).toHaveAttribute('aria-checked', 'false');
    });

    it('while on, hides the hub animation; turning it off only saves the flag', async () => {
      argb({ argbSync: true, argbSyncSource: 'openrgb-1' });
      await renderOnLighting(<LianLiDevicePage />);
      expect(screen.queryByText('devices.lianli.lightingSection')).not.toBeInTheDocument();
      await act(async () => { fireEvent.click(toggle()); });
      expect(mockSetDeviceChain).not.toHaveBeenCalled();
      expect(mockSetLianLiLighting).toHaveBeenCalledWith({ argbSync: false }, 'lianli');
      expect(screen.getByText('devices.lianli.lightingSection')).toBeInTheDocument();
    });

    it('switching the source while on wires the new header and clears the chain it put on the old one', async () => {
      argb({ argbSync: true, argbSyncSource: 'openrgb-1' });
      mockFetchDeviceStructure.mockImplementation((id: string) => Promise.resolve(id === 'openrgb-1'
        ? { id, name: 'Header 1', chain: [{ ...product, name: 'SL120', ledCount: 20, editableCount: false }] }
        : { id, name: 'SmartHub', chain: [] }));
      await renderOnLighting(<LianLiDevicePage />);
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.argbSyncSource' }));
      await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'SmartHub Port 4' })); });
      expect(mockSetDeviceChain).toHaveBeenCalledWith('smarthub:1:port4', [product, product, product]);
      expect(mockSetLianLiLighting).toHaveBeenCalledWith({ argbSyncSource: 'smarthub:1:port4' }, 'lianli');
      expect(mockSetDeviceChain).toHaveBeenCalledWith('openrgb-1', []);
    });
  });
});
