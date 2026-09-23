import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessLightingTab } from './LianLiWirelessLightingTab';
import type { LianLiWirelessStrimer, LianLiWirelessStrimers } from '../../../api/lianli-wireless';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetStrimers = vi.fn();
const mockSetStrimer = vi.fn();

vi.mock('../../../api/lianli-wireless', () => ({
  getLianLiWirelessStrimers: (...args: any[]) => mockGetStrimers(...args),
  setLianLiWirelessStrimer: (...args: any[]) => mockSetStrimer(...args),
}));

const strimer: LianLiWirelessStrimer = {
  mac: '64F271E566E1',
  devType: 2,
  model: 'Strimer 24-Pin',
  lanes: 6,
  ledsPerLane: 22,
  mode: 'meteor',
  speed: 2,
  direction: 0,
  brightness: 4,
  colors: [],
  laneSettings: [],
};

const catalog: LianLiWirelessStrimers = {
  modes: [
    { key: 'rainbow', hasSpeed: true, hasDirection: true, colorsMin: 0, colorsMax: 0 },
    { key: 'static', hasSpeed: false, hasDirection: false, colorsMin: 1, colorsMax: 1 },
    { key: 'meteor', hasSpeed: true, hasDirection: true, colorsMin: 1, colorsMax: 3 },
  ],
  laneModes: ['rainbow', 'static'],
  strimers: [strimer],
};

function withStrimer(patch: Partial<LianLiWirelessStrimer>): LianLiWirelessStrimers {
  return { ...catalog, strimers: [{ ...strimer, ...patch }] };
}

async function renderTab(data: LianLiWirelessStrimers = catalog, onSectionNavigate?: (s: string) => void) {
  mockGetStrimers.mockResolvedValue(data);
  await act(async () => {
    render(<LianLiWirelessLightingTab onSectionNavigate={onSectionNavigate} />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSetStrimer.mockResolvedValue(true);
});

describe('LianLiWirelessLightingTab', () => {
  it('renders one section per cable, titled with its model', async () => {
    await renderTab();
    expect(screen.getByText('Strimer 24-Pin')).toBeInTheDocument();
  });

  it('an effect with colours shows speed, direction and the default palette up to its maximum', async () => {
    await renderTab();
    const section = screen.getByText('Strimer 24-Pin').closest('section')!;
    expect(within(section).getByText('devices.lianli.lightingSpeed')).toBeInTheDocument();
    expect(within(section).getByText('devices.lianli.lightingDirection')).toBeInTheDocument();
    expect(within(section).getAllByLabelText('common.hexColor')).toHaveLength(3);
    expect(within(section).queryByText('devices.lianli.addColor')).not.toBeInTheDocument();
  });

  it('an effect without speed or direction hides both', async () => {
    await renderTab(withStrimer({ mode: 'static' }));
    expect(screen.queryByText('devices.lianli.lightingSpeed')).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.lightingDirection')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('common.hexColor')).toHaveLength(1);
  });

  it('custom mode shows the lighting-page note and link instead of the animation controls', async () => {
    const nav = vi.fn();
    await renderTab(withStrimer({ mode: 'custom' }), nav);
    expect(screen.getByText('devices.lianli.customModeNote')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.lightingBrightness')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'smartLights.colorOnLightingPage' }));
    expect(nav).toHaveBeenCalledWith('lighting');
  });

  it('per-lane mode shows one row per lane', async () => {
    await renderTab(withStrimer({ mode: 'perLane' }));
    for (let n = 1; n <= 6; n++) {
      expect(screen.getByText(`devices.lianli-wireless.strimerLaneN:{"n":${n}}`)).toBeInTheDocument();
    }
    expect(screen.getAllByLabelText('common.hexColor')).toHaveLength(6);
  });

  it('picking a mode sends it for that cable', async () => {
    await renderTab();
    fireEvent.click(screen.getByLabelText('devices.lianli.lightingMode'));
    fireEvent.click(await screen.findByRole('option', { name: 'devices.strimerEffect.rainbow' }));
    expect(mockSetStrimer).toHaveBeenCalledWith('64F271E566E1', { mode: 'rainbow' });
  });

  it('lists custom first and per-lane last around the effect catalog', async () => {
    await renderTab();
    fireEvent.click(screen.getByLabelText('devices.lianli.lightingMode'));
    const options = await screen.findAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual([
      'devices.lianli-wireless.strimerModeCustom',
      'devices.strimerEffect.rainbow',
      'devices.strimerEffect.static',
      'devices.strimerEffect.meteor',
      'devices.lianli-wireless.strimerModePerLane',
    ]);
  });
});
