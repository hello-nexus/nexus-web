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
const mockGetLianLiCooling = vi.fn();
const mockSetLianLiLighting = vi.fn();
const mockSetLianLiPortCooling = vi.fn();
const mockSetLianLiFanCount = vi.fn();

vi.mock('../../../api/lianli', () => ({
  getLianLiState: (...args: any[]) => mockGetLianLiState(...args),
  getLianLiLighting: (...args: any[]) => mockGetLianLiLighting(...args),
  getLianLiCooling: (...args: any[]) => mockGetLianLiCooling(...args),
  setLianLiLighting: (...args: any[]) => mockSetLianLiLighting(...args),
  setLianLiPortCooling: (...args: any[]) => mockSetLianLiPortCooling(...args),
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

const defaultCooling = {
  ports: [
    { port: 0, mode: 'Manual', dutyPercent: 75 },
    { port: 1, mode: 'Auto', dutyPercent: 50 },
    { port: 2, mode: 'Manual', dutyPercent: 30 },
    { port: 3, mode: 'Auto', dutyPercent: 50 },
  ],
};

function clickTab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetLianLiState.mockResolvedValue(defaultState);
  mockGetLianLiLighting.mockResolvedValue(defaultLighting);
  mockGetLianLiCooling.mockResolvedValue(defaultCooling);
  mockSetLianLiLighting.mockResolvedValue(null);
  mockSetLianLiPortCooling.mockResolvedValue(null);
  mockSetLianLiFanCount.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LianLiDevicePage', () => {
  it('renders two tabs with Lighting active by default', async () => {
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual([
      'devices.lianli.tabLighting',
      'devices.lianli.tabCooling',
    ]);
    expect(screen.getByRole('tab', { name: 'devices.lianli.tabLighting' }))
      .toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('devices.lianli.lightingSection')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.coolingSection')).not.toBeInTheDocument();
  });

  it('Cooling tab: all 4 ports shown in fan-speed section', async () => {
    const spy = vi.fn();
    await act(async () => {
      render(<LianLiDevicePage onSectionNavigate={spy} />);
    });
    await act(async () => {
      clickTab('devices.lianli.tabCooling');
    });

    const fanSpeedSection = screen.getByText('devices.lianli.coolingSection').closest('section')!;

    // All 4 ports render regardless of fansPerPort count.
    expect(within(fanSpeedSection).getByText('devices.lianli.port:{"n":1}')).toBeInTheDocument();
    expect(within(fanSpeedSection).getByText('devices.lianli.port:{"n":2}')).toBeInTheDocument();
    expect(within(fanSpeedSection).getByText('devices.lianli.port:{"n":3}')).toBeInTheDocument();
    expect(within(fanSpeedSection).getByText('devices.lianli.port:{"n":4}')).toBeInTheDocument();

    // Duty rows present (no per-port mode Select).
    const dutyRows = within(fanSpeedSection).getAllByText('devices.lianli.dutyLabel');
    expect(dutyRows.length).toBe(4);

    // No mode Select: neither firmware-speed nor motherboard-pwm labels appear here.
    expect(within(fanSpeedSection).queryByText('devices.lianli.modeFirmwareSpeed')).not.toBeInTheDocument();
    expect(within(fanSpeedSection).queryByText('devices.lianli.modeMotherboardPwm')).not.toBeInTheDocument();

    // coolingPageLink button navigates to the cooling page.
    const coolingBtn = within(fanSpeedSection).getByRole('button', { name: 'devices.lianli.coolingPageLink' });
    fireEvent.click(coolingBtn);
    expect(spy).toHaveBeenCalledWith('cooling');
  });

  it('custom mode shows customModeNote and lighting-page button; no speed/brightness sliders', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'custom',
    });
    await act(async () => {
      render(<LianLiDevicePage onSectionNavigate={vi.fn()} />);
    });
    expect(screen.getByText('devices.lianli.customModeNote')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.lightingSpeed')).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.lightingBrightness')).not.toBeInTheDocument();
    // Mode Select stays rendered in custom mode.
    expect(screen.getByText('devices.lianli.lightingMode')).toBeInTheDocument();
    // Lighting-page link button present only in custom mode.
    expect(screen.getByRole('button', { name: 'smartLights.colorOnLightingPage' })).toBeInTheDocument();
  });

  it('firmware mode does NOT show lighting-page link button', async () => {
    const spy = vi.fn();
    await act(async () => {
      render(<LianLiDevicePage onSectionNavigate={spy} />);
    });
    // defaultLighting.mode is 'static' (a firmware mode).
    expect(screen.queryByRole('button', { name: /smartLights\.colorOnLightingPage/i })).not.toBeInTheDocument();
  });

  it('firmware mode shows brightness slider first', async () => {
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    // In static mode (firmware), brightness should appear.
    expect(screen.getByText('devices.lianli.lightingBrightness')).toBeInTheDocument();
    // Speed also appears (static hasSpeed=true).
    expect(screen.getByText('devices.lianli.lightingSpeed')).toBeInTheDocument();
    // Verify brightness comes before speed in the DOM.
    const brightness = screen.getByText('devices.lianli.lightingBrightness');
    const speed = screen.getByText('devices.lianli.lightingSpeed');
    expect(brightness.compareDocumentPosition(speed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('colorsMax===2 mode renders exactly 2 HsvPicker side-by-side with no add/remove', async () => {
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
    // No add/remove controls in the fixed 2-color pair.
    expect(within(section).queryByText('devices.lianli.addColor')).not.toBeInTheDocument();
    expect(within(section).queryByText('devices.lianli.removeColor')).not.toBeInTheDocument();
  });

  it('Lighting tab custom mode link navigates to lighting page', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'custom',
    });
    const spy = vi.fn();
    await act(async () => {
      render(<LianLiDevicePage onSectionNavigate={spy} />);
    });
    const btn = screen.getByRole('button', { name: 'smartLights.colorOnLightingPage' });
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledWith('lighting');
  });
});
