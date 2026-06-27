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
  mockGetLianLiState.mockResolvedValue(defaultState);
  mockGetLianLiLighting.mockResolvedValue(defaultLighting);
  mockGetLianLiCooling.mockResolvedValue(defaultCooling);
  mockSetLianLiLighting.mockResolvedValue(null);
  mockSetLianLiPortCooling.mockResolvedValue(null);
  mockSetLianLiFanCount.mockResolvedValue(null);
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

  it('Cooling tab: fan-speed section only shows ports with fans; controls render correctly', async () => {
    const spy = vi.fn();
    await act(async () => {
      render(<LianLiDevicePage onSectionNavigate={spy} />);
    });
    await act(async () => {
      clickTab('devices.lianli.tabCooling');
    });

    // scope assertions to the fan-speed section
    const fanSpeedSection = screen.getByText('devices.lianli.coolingSection').closest('section')!;

    // ports 1 and 2 have fans - shown in fan-speed section
    expect(within(fanSpeedSection).getByText('devices.lianli.port:{"n":1}')).toBeInTheDocument();
    expect(within(fanSpeedSection).getByText('devices.lianli.port:{"n":2}')).toBeInTheDocument();

    // ports 3 and 4 have 0 fans - hidden from fan-speed section
    expect(within(fanSpeedSection).queryByText('devices.lianli.port:{"n":3}')).not.toBeInTheDocument();
    expect(within(fanSpeedSection).queryByText('devices.lianli.port:{"n":4}')).not.toBeInTheDocument();

    // port 1 is Manual in defaultCooling - duty row shows
    expect(within(fanSpeedSection).getByText('devices.lianli.dutyLabel')).toBeInTheDocument();

    // mode option labels appear as trigger selected values
    expect(within(fanSpeedSection).getByText('devices.lianli.modeFirmwareSpeed')).toBeInTheDocument();
    expect(within(fanSpeedSection).getByText('devices.lianli.modeMotherboardPwm')).toBeInTheDocument();

    // coolingPageLink button navigates to the cooling page
    const coolingBtn = within(fanSpeedSection).getByRole('button', { name: 'devices.lianli.coolingPageLink' });
    fireEvent.click(coolingBtn);
    expect(spy).toHaveBeenCalledWith('cooling');
  });

  it('custom mode shows customModeNote instead of mode-conditional controls', async () => {
    mockGetLianLiLighting.mockResolvedValue({
      ...defaultLighting,
      mode: 'custom',
    });
    await act(async () => {
      render(<LianLiDevicePage />);
    });
    expect(screen.getByText('devices.lianli.customModeNote')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.lightingSpeed')).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.lightingBrightness')).not.toBeInTheDocument();
    // mode Select stays rendered in custom mode (regression guard for Fix 1)
    expect(screen.getByText('devices.lianli.lightingMode')).toBeInTheDocument();
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

  it('Lighting tab shows Color & brightness link when onSectionNavigate provided', async () => {
    const spy = vi.fn();
    await act(async () => {
      render(<LianLiDevicePage onSectionNavigate={spy} />);
    });
    const btn = screen.getByRole('button', { name: /smartLights\.colorOnLightingPage/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledWith('lighting');
  });
});
