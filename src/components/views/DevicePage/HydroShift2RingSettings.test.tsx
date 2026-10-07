import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HydroShift2RingSettings } from './HydroShift2RingSettings';
import type { HydroShift2Lighting } from '../../../api/hydroshift2';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('../../../api/hydroshift2', () => ({
  getHydroShift2Lighting: (...args: any[]) => mockGet(...args),
  setHydroShift2Lighting: (...args: any[]) => mockSet(...args),
}));

const lighting: HydroShift2Lighting = {
  mode: 'meteor',
  effectMode: 'meteor',
  speed: 2,
  direction: 0,
  brightness: 4,
  colors: ['#111111'],
  modes: [
    { key: 'rainbow', colors: 0, hasDirection: true, hasSpeed: true, hasBrightness: true },
    { key: 'static', colors: 1, hasDirection: false, hasSpeed: false, hasBrightness: true },
    { key: 'meteor', colors: 4, hasDirection: true, hasSpeed: true, hasBrightness: true },
  ],
};

async function renderSettings(data: HydroShift2Lighting = lighting) {
  mockGet.mockResolvedValue(data);
  await act(async () => {
    render(<HydroShift2RingSettings />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue({});
});

describe('HydroShift2RingSettings', () => {
  it('lists the pump head effects by their localized names', async () => {
    await renderSettings();
    fireEvent.click(screen.getByLabelText('devices.lianli.lightingMode'));
    const options = await screen.findAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual([
      'devices.lianliEffect.rainbow', 'devices.lianliEffect.static', 'devices.lianliEffect.meteor',
    ]);
  });

  it('fills an effect palette from the pump head defaults past the colours set', async () => {
    await renderSettings();
    const inputs = screen.getAllByLabelText('common.hexColor') as HTMLInputElement[];
    expect(inputs.map(i => i.value)).toEqual(['#111111', '#0000FF', '#00FF00', '#FFFF00']);
    expect(screen.getByText('devices.lianli.lightingDirection')).toBeInTheDocument();
  });

  it('a single-colour effect without speed shows one picker and no speed or direction', async () => {
    await renderSettings({ ...lighting, mode: 'static', effectMode: 'static' });
    expect(screen.getAllByLabelText('common.hexColor')).toHaveLength(1);
    expect(screen.queryByText('devices.lianli.lightingSpeed')).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lianli.lightingDirection')).not.toBeInTheDocument();
  });

  it('handing the ring to the Lighting page stores the canvas mode', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('switch', { name: 'devices.lightingPage.use' }));
    expect(mockSet).toHaveBeenLastCalledWith({ mode: 'canvas' });
  });

  it('taking it back restores the remembered effect', async () => {
    await renderSettings({ ...lighting, mode: 'canvas', effectMode: 'rainbow' });
    fireEvent.click(screen.getByRole('switch', { name: 'devices.lightingPage.use' }));
    expect(mockSet).toHaveBeenLastCalledWith({ mode: 'rainbow' });
  });
});
