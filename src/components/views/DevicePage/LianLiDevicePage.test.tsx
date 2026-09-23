import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

vi.mock('../../../api/lianli', () => ({
  getLianLiState: (...args: any[]) => mockGetLianLiState(...args),
  getLianLiLighting: (...args: any[]) => mockGetLianLiLighting(...args),
  setLianLiLighting: (...args: any[]) => mockSetLianLiLighting(...args),
  setLianLiFanCount: (...args: any[]) => mockSetLianLiFanCount(...args),
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
  vi.useFakeTimers();
  mockGetLianLiState.mockResolvedValue(defaultState);
  mockGetLianLiLighting.mockResolvedValue(defaultLighting);
  mockSetLianLiLighting.mockResolvedValue(null);
  mockSetLianLiFanCount.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LianLiDevicePage', () => {
  it('renders no tabs - single scrolling page', async () => {
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('port configuration section renders first with all 4 ports', async () => {
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    const portSection = screen.getByText('devices.lianli.portsSection').closest('section')!;
    expect(portSection).toBeInTheDocument();
    expect(within(portSection).getByText('devices.lianli.port:{"n":1}')).toBeInTheDocument();
    expect(within(portSection).getByText('devices.lianli.port:{"n":2}')).toBeInTheDocument();
    expect(within(portSection).getByText('devices.lianli.port:{"n":3}')).toBeInTheDocument();
    expect(within(portSection).getByText('devices.lianli.port:{"n":4}')).toBeInTheDocument();
  });

  it('lighting section renders below port configuration', async () => {
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    const portSection = screen.getByText('devices.lianli.portsSection').closest('section')!;
    const lightingSection = screen.getByText('devices.lianli.lightingSection').closest('section')!;
    // Lighting section follows port section in the DOM.
    expect(portSection.compareDocumentPosition(lightingSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('firmware mode shows brightness slider first, then speed slider', async () => {
    await act(async () => {
      render(<LianLiDevicePage />);
    });
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
    await act(async () => {
      render(<LianLiDevicePage onSectionNavigate={vi.fn()} />);
    });
    expect(screen.getByRole('switch', { name: 'devices.lightingPage.use' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'smartLights.colorOnLightingPage' })).toBeInTheDocument();
    const modeSelect = screen.getByRole('button', { name: 'devices.lianli.lightingMode' });
    expect(modeSelect).toHaveTextContent('Rainbow Wave');
    expect(modeSelect).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'devices.lianli.lightingSpeedAria' })).toBeDisabled();
  });

  it('turning the switch off restores the last animation', async () => {
    mockGetLianLiLighting.mockResolvedValue({ ...defaultLighting, mode: 'custom', effectMode: 'rainbowWave' });
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.lightingPage.use' }));
    });
    expect(mockSetLianLiLighting).toHaveBeenCalledWith({ mode: 'rainbowWave' });
  });

  it('turning the switch on hands the hub to the Lighting page', async () => {
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.lightingPage.use' }));
    });
    expect(mockSetLianLiLighting).toHaveBeenCalledWith({ mode: 'custom' });
  });

  it('keeps the Lighting page mode out of the animation list', async () => {
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.lightingMode' }));
    const options = screen.getAllByRole('option');
    expect(options.map(o => o.textContent)).not.toContain('Custom (per-LED effects)');
  });

  it('firmware mode does NOT show lighting-page link button', async () => {
    const spy = vi.fn();
    await act(async () => {
      render(<LianLiDevicePage onSectionNavigate={spy} />);
    });
    // defaultLighting.mode is 'static' (a firmware mode).
    expect(screen.queryByRole('button', { name: /smartLights\.colorOnLightingPage/i })).not.toBeInTheDocument();
  });

  it('rainbowWave mode shows direction select but no color pickers', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'rainbowWave',
    });
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    expect(screen.getByText('devices.lianli.lightingDirection')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.addColor')).not.toBeInTheDocument();
  });

  it('colorsMax===2 mode renders exactly 2 HsvPickers with Color 1 / Color 2 labels', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'dualColor',
      colors: ['#ff0000'],
    });
    await act(async () => {
      render(<LianLiDevicePage />);
    });
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
    await act(async () => {
      render(<LianLiDevicePage onSectionNavigate={spy} />);
    });
    const btn = screen.getByRole('button', { name: 'smartLights.colorOnLightingPage' });
    btn.click();
    expect(spy).toHaveBeenCalledWith('lighting');
  });
});
