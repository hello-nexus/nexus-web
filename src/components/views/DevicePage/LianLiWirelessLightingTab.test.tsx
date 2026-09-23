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

  it('editing one colour keeps the rest of the stored palette', async () => {
    await renderTab(withStrimer({ colors: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] }));
    const inputs = screen.getAllByLabelText('common.hexColor');
    expect(inputs.map(i => (i as HTMLInputElement).value)).toEqual(['#111111', '#222222', '#333333']);
    fireEvent.change(inputs[1], { target: { value: '#abcdef' } });
    expect(mockSetStrimer).toHaveBeenLastCalledWith('64F271E566E1', {
      colors: ['#111111', '#abcdef', '#333333', '#444444', '#555555', '#666666'],
      effectMode: undefined,
    });
  });

  it('re-reads the cable when the service rejects a change', async () => {
    mockSetStrimer.mockResolvedValue(false);
    await renderTab();
    fireEvent.click(screen.getByLabelText('devices.lianli.lightingMode'));
    await act(async () => {
      fireEvent.click(await screen.findByRole('option', { name: 'devices.strimerEffect.rainbow' }));
    });
    expect(mockGetStrimers).toHaveBeenCalledTimes(2);
  });

  it('an effect without speed or direction hides both', async () => {
    await renderTab(withStrimer({ mode: 'static' }));
    expect(screen.queryByText('devices.lianli.lightingSpeed')).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.lightingDirection')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('common.hexColor')).toHaveLength(1);
  });

  it('Lighting page mode greys out the animation the cable returns to', async () => {
    const nav = vi.fn();
    await renderTab(withStrimer({ mode: 'custom', effectMode: 'static' }), nav);
    expect(screen.getByRole('switch', { name: 'devices.lightingPage.use' })).toHaveAttribute('aria-checked', 'true');
    const modeSelect = screen.getByRole('button', { name: 'devices.lianli.lightingMode' });
    expect(modeSelect).toHaveTextContent('devices.strimerEffect.static');
    expect(modeSelect).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'devices.lianli.lightingBrightnessAria' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'smartLights.colorOnLightingPage' }));
    expect(nav).toHaveBeenCalledWith('lighting');
  });

  it('turning the switch off plays the last animation again', async () => {
    await renderTab(withStrimer({ mode: 'custom', effectMode: 'static' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.lightingPage.use' }));
    });
    expect(mockSetStrimer).toHaveBeenCalledWith('64F271E566E1', { mode: 'static', effectMode: undefined });
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
    expect(mockSetStrimer).toHaveBeenCalledWith('64F271E566E1', { mode: 'rainbow', effectMode: undefined });
  });

  it('lists the effect catalog with per-lane last', async () => {
    await renderTab();
    fireEvent.click(screen.getByLabelText('devices.lianli.lightingMode'));
    const options = await screen.findAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual([
      'devices.strimerEffect.rainbow',
      'devices.strimerEffect.static',
      'devices.strimerEffect.meteor',
      'devices.lianli-wireless.strimerModePerLane',
    ]);
  });
});
